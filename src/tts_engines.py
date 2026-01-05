# tts_engines.py

'''
Note for sliders: Due to Qt6 sliders, to mimick decimal values, a "step" parameter is used so if a decimal value needs to be passed into some engine, the value passed from the voice settings needs to be divided by step.

For example, let's take "speed" from f5tts.  It needs to be a decimal value but Qt6 slider only allows for whole numbers  The tts_config has a step=100 with min=1 and max=200, so any value between those can be chosen.  Therefore, if the slider outputs 30, it should be 0.30 as round(30 / step, 2) = 0.30
'''

import importlib.util, os, sys
import json
import numpy as np
import soundfile as sf
import traceback


class EngineUnavailable(RuntimeError):
    pass


_DEBUG_CACHE = None


def _debug_enabled() -> bool:
    """Returns True when debug logging/tracebacks should be printed."""
    global _DEBUG_CACHE
    if _DEBUG_CACHE is not None:
        return _DEBUG_CACHE

    env = os.environ.get("AUDIOBOOK_MAKER_DEBUG", "").strip().lower()
    if env in {"1", "true", "yes", "on"}:
        _DEBUG_CACHE = True
        return True
    if env in {"0", "false", "no", "off"}:
        _DEBUG_CACHE = False
        return False

    # Fall back to configs/settings.yaml without requiring PyYAML.
    try:
        with open("configs/settings.yaml", "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.lower().startswith("debug_mode"):
                    _, value = line.split(":", 1)
                    value = value.strip().strip('"').strip("'").lower()
                    _DEBUG_CACHE = value in {"1", "true", "yes", "on"}
                    return _DEBUG_CACHE
    except Exception:
        pass

    _DEBUG_CACHE = False
    return False
def _add_module_path(rel):
    base_dir = os.path.join(os.path.dirname(__file__), '..', 'modules', rel)
    base_dir = os.path.abspath(base_dir)
    if os.path.isdir(base_dir) and base_dir not in sys.path:
        sys.path.insert(0, base_dir)

# Ensure local modules are importable when not installed via pip
_add_module_path('tortoise_tts_api')
_add_module_path('styletts-api')
_add_module_path('F5-TTS')
_add_module_path('GPT-SoVITS-Package')

# Lazy-imported engine entrypoints.
load_tortoise_engine = None
tortoise_generate = None
load_all_models = None
stts_generate = None
F5TTS = None

# Optional dependency; will remain None until GPT-SoVITS is selected.
TTS = None
TTS_Config = None


def _require_tortoise():
    global load_tortoise_engine, tortoise_generate
    if load_tortoise_engine is not None and tortoise_generate is not None:
        return
    try:
        from tortoise_tts_api.inference.load import load_tts as _load_tts
        from tortoise_tts_api.inference.generate import generate as _generate
        load_tortoise_engine = _load_tts
        tortoise_generate = _generate
    except Exception as e:
        if _debug_enabled():
            traceback.print_exc()
        raise EngineUnavailable(
            "Tortoise is not available in this environment. "
            "Install/enable its dependencies, or choose a different TTS engine."
        ) from e


def _require_styletts2():
    global load_all_models, stts_generate
    if load_all_models is not None and stts_generate is not None:
        return
    try:
        from styletts_api.inference.load import load_all_models as _load_all_models
        from styletts_api.inference.generate import generate_audio as _generate_audio
        load_all_models = _load_all_models
        stts_generate = _generate_audio
    except Exception as e:
        if _debug_enabled():
            traceback.print_exc()
        raise EngineUnavailable(
            "StyleTTS2 is not available in this environment (missing 'styletts2' package). "
            "Install StyleTTS2 or choose a different TTS engine."
        ) from e


def _require_f5tts():
    global F5TTS
    if F5TTS is not None:
        return F5TTS
    try:
        from f5_tts.api import F5TTS as _F5TTS
        F5TTS = _F5TTS
        return F5TTS
    except Exception as e:
        if _debug_enabled():
            traceback.print_exc()
        raise EngineUnavailable(
            "F5-TTS could not be imported. Ensure the F5-TTS module/dependencies are installed."
        ) from e

def generate_audio(tts_engine, sentence, voice_parameters, tts_engine_name, audio_path):
    tts_engine_name = tts_engine_name.lower()
    if tts_engine_name == 'pyttsx3':
        return generate_with_pyttsx3(tts_engine, sentence, voice_parameters, audio_path)
    elif tts_engine_name == 'styletts2':
        return generate_with_styletts2(tts_engine, sentence, voice_parameters, audio_path)
    elif tts_engine_name == 'tortoise':
        return generate_with_tortoise(tts_engine, sentence, voice_parameters, audio_path)
    elif tts_engine_name == 'xtts':
        return generate_with_xtts(tts_engine, sentence, voice_parameters, audio_path)
    elif tts_engine_name == 'f5tts':
        return generate_with_f5tts(tts_engine, sentence, voice_parameters, audio_path)
    elif tts_engine_name == 'gpt_sovits':
        return generate_with_gpt_sovits(tts_engine, sentence, voice_parameters, audio_path)
    else:
        # Handle unknown engine
        return False

def generate_with_pyttsx3(tts_engine, sentence, voice_parameters, audio_path):
    import pyttsx3
    engine = pyttsx3.init()
    # Optionally set voice parameters here using voice_parameters
    # e.g., engine.setProperty('rate', voice_parameters.get('rate', 200))
    # Save the spoken sentence to an audio file
    engine.save_to_file(sentence, audio_path)
    engine.runAndWait()
    return os.path.exists(audio_path)

def generate_with_styletts2(tts_engine, sentence, voice_parameters, audio_path):
    _require_styletts2()
    engine_name = "StyleTTS2" 
    # Load the config and convert it to an object
    tts_config = load_config("configs/tts_config.json")
    tts_settings = dict_to_object(tts_config)

    styletts_engine_config = None
    for engine in tts_settings.tts_engines:
        if engine.name.lower() == engine_name.lower():  # Case-insensitive matching
            styletts_engine_config = engine
            break
        
    voice_root = next((param.folder_path for param in styletts_engine_config.parameters if param.attribute == "stts_voice"))

    voice = voice_parameters.get("stts_voice", None)
    if not voice:
        raise ("No voice found for StyleTTS")
    reference_audio_file = voice_parameters.get("stts_reference_audio_file")
    seed = int(voice_parameters.get("stts_seed"))
    if not seed:
        seed=-1
    diffusion_steps = voice_parameters.get("stts_diffusion_steps")
    
    alpha_step = next((param.step for param in styletts_engine_config.parameters if param.attribute=="stts_alpha"), 100)
    alpha = round(voice_parameters.get("stts_alpha", 70) / alpha_step, 2)
    
    beta_step = next((param.step for param in styletts_engine_config.parameters if param.attribute=="stts_beta"), 100)
    beta = round(voice_parameters.get("stts_beta", 30) / beta_step, 2)
    
    embedding_scale_step = next((param.step for param in styletts_engine_config.parameters if param.attribute=="stts_embedding_scale"), 100)
    embedding_scale = round(voice_parameters.get("stts_embedding_scale", 50) / embedding_scale_step, 2)
    
    audio_path = stts_generate(
        text=sentence, 
        voice=voice, 
        reference_audio_file=reference_audio_file, 
        seed=seed, 
        diffusion_steps=diffusion_steps, 
        alpha=alpha, 
        beta=beta, 
        embedding_scale=embedding_scale, 
        output_audio_path=audio_path,
        model_dict=tts_engine, 
        voices_root=voice_root
        )
    return audio_path

def generate_with_tortoise(tts_engine, sentence, voice_parameters, audio_path):
    _require_tortoise()
    engine_name = "Tortoise"
    tts_settings = load_tts_config()
    tortoise_engine_config = find_engine_config(engine_name, tts_settings)

    if tortoise_engine_config is None:
        raise RuntimeError("Tortoise engine configuration not found")

    if tts_engine is None:
        raise RuntimeError("Tortoise engine was not loaded")
    if tts_engine is None:
        return False
    voice = voice_parameters.get('voice', 'random')
    sample_size = voice_parameters.get('sample_size', 4)
    use_hifigan = voice_parameters.get('use_hifigan', False)
    num_autoregressive_samples = sample_size
    seed = voice_parameters.get("tortoise_seed", -1)
    iterations = voice_parameters.get("tortoise_iterations", 25)
    max_text_tokens = voice_parameters.get("tortoise_max_text_tokens", 390)
    extra_voice_dirs = next((param.folder_path for param in tortoise_engine_config.parameters if param.attribute == "voice"), [])

    result = tortoise_generate(
        tts=tts_engine,
        text=sentence,
        voice=voice,
        seed=seed,
        use_hifigan=use_hifigan,
        num_autoregressive_samples=num_autoregressive_samples,
        diffusion_iterations=iterations,
        audio_path=audio_path,
        extra_voice_dirs=[extra_voice_dirs],
        max_text_tokens=max_text_tokens,
    )
    return os.path.exists(audio_path)

def generate_with_xtts(tts_engine, sentence, voice_parameters, audio_path):
    # Implement xtts TTS engine generation here
    pass

def generate_with_f5tts(tts_engine, sentence, voice_parameters, audio_path):
    _require_f5tts()
    engine_name = "f5tts"
    tts_settings = load_tts_config()
    f5tts_engine_config = find_engine_config(engine_name, tts_settings)
    
    voice_name = voice_parameters.get("f5tts_voice")
    ref_file_root = next((param.folder_path for param in f5tts_engine_config.parameters if param.attribute == "f5tts_voice" ))
    
    ref_file_path = os.path.join(ref_file_root, voice_name, f"{voice_name}.wav")
    ref_text = os.path.join(ref_file_root, voice_name, f"{voice_name}.txt")
    with open(ref_text, "r", encoding="utf-8") as f:
        ref_text = f.readline()
        

    seed = voice_parameters.get("f5tts_seed", -1)
    
    speed_step = next((param.step for param in f5tts_engine_config.parameters if param.attribute=="f5tts_speed"), 100)
    speed = round(voice_parameters.get("f5tts_speed") / speed_step, 2)
    
    tts_engine.infer(
        ref_file=ref_file_path,
        ref_text=ref_text,
        gen_text=sentence,
        file_wave=audio_path,
        speed=speed,
        seed=seed
    )
    
    return audio_path

def generate_with_gpt_sovits(tts_engine, sentence, voice_parameters, audio_path):
    
    tts_settings = load_tts_config()
    gpt_sovits_engine_config = find_engine_config("gpt_sovits", tts_settings)
    
    voice_name = voice_parameters.get("gpt_sovits_voice")
    voice_root_path = next(param.folder_path for param in gpt_sovits_engine_config.parameters if param.attribute == "gpt_sovits_voice")
    voice_ref_audio_path = os.path.join(voice_root_path, voice_name, f"{voice_name}.wav")
    voice_ref_text_path = os.path.join(voice_root_path, voice_name, f"{voice_name}.txt")
    with open(voice_ref_text_path, "r", encoding="utf-8") as f:
        voice_ref_text_transcript = f.readline()
    
    top_k_steps = next((param.step for param in gpt_sovits_engine_config.parameters if param.attribute=="gpt_sovits_top_k"), 500)
    top_k = int(round(voice_parameters.get("gpt_sovits_top_k") / top_k_steps, 2))
    
    top_p_steps = next((param.step for param in gpt_sovits_engine_config.parameters if param.attribute=="gpt_sovits_top_p"), 100)
    top_p = round(voice_parameters.get("gpt_sovits_top_p") / top_p_steps, 2)
    
    temperature_steps = next((param.step for param in gpt_sovits_engine_config.parameters if param.attribute=="gpt_sovits_temperature"), 100)
    temperature = round(voice_parameters.get("gpt_sovits_temperature") / temperature_steps, 2)
    
    sample_steps = voice_parameters.get("gpt_sovits_sample_steps")
    
    inputs = {
        "text": sentence,
        "text_lang" : voice_parameters.get("gpt_sovits_output_lang"),
        "ref_audio_path": voice_ref_audio_path,
        "prompt_text": voice_ref_text_transcript,
        "prompt_lang" : voice_parameters.get("gpt_sovits_ref_lang"),
        "seed": voice_parameters.get("gpt_sovits_seed"),
        "top_k" : top_k,
        "top_p" : top_p,
        "temperature" : temperature,
        "sample_steps" : sample_steps
    }
    
    gen = tts_engine.run(inputs)
    
    fragments = []
    sr, first_fragment = next(gen)
    fragments.append(first_fragment)
    for _, fragment in gen:
        fragments.append(fragment)

    combined_audio = np.concatenate(fragments, axis=0)
    sf.write(audio_path, combined_audio, sr)
    
    return audio_path
    
#################################################
############### Loading Functions ###############
#################################################                         

def load_tts_engine(tts_engine_name, **kwargs):
    tts_engine_name = tts_engine_name.lower()
    try:
        if tts_engine_name == 'pyttsx3':
            return None  # pyttsx3 doesn't require loading
        elif tts_engine_name == 'styletts2':
            return load_with_styletts2(**kwargs)
        elif tts_engine_name == 'tortoise':
            return load_with_tortoise(**kwargs)
        elif tts_engine_name == 'xtts':
            return load_with_xtts(**kwargs)
        elif tts_engine_name == "f5tts":
            return load_with_f5tts(**kwargs)
        elif tts_engine_name == 'gpt_sovits':
            return load_with_gpt_sovits(**kwargs)
        else:
            # Handle unknown engine
            raise ValueError(f"Unknown TTS engine: {tts_engine_name}")
    except Exception as e:
        # Re-raise the exception to be caught by the worker thread
        raise e

def load_with_styletts2(**kwargs):
    _require_styletts2()
    engine_name = "StyleTTS2" 
    tts_settings = load_tts_config()
    styletts_engine_config = find_engine_config(engine_name, tts_settings)
    
    model_root = next((param.folder_path for param in styletts_engine_config.parameters if param.attribute == "stts_model_path"))
    model_folder_name = kwargs.get("stts_model_path")
    if _debug_enabled():
        print(model_root)
        print(model_folder_name)
    folder_to_walk = os.path.join(model_root, model_folder_name)
    model_path = next(
        (os.path.join(folder_to_walk, file) for file in os.listdir(folder_to_walk) if file.endswith(".pth")),
        None
    )
    model_dict = load_all_models(model_path=model_path)
    return model_dict

def load_with_tortoise(**kwargs):
    _require_tortoise()
    engine_name = "Tortoise" 
    tts_settings = load_tts_config()
    tortoise_engine_config = find_engine_config(engine_name, tts_settings)
        
    # Find the folder paths for autoregressive model and tokenizer in the config
    ar_folder_path = next((param.folder_path for param in tortoise_engine_config.parameters if param.attribute == "autoregressive_model_path"), None)
    tokenizer_folder_path = next((param.folder_path for param in tortoise_engine_config.parameters if param.attribute == "tokenizer_json_path"), None)
    
    # Parameters needed to load the tortoise engine
    autoregressive_model_path = kwargs.get("autoregressive_model_path")
    if autoregressive_model_path:
        autoregressive_model_path = os.path.join(ar_folder_path, autoregressive_model_path)

    # Guardrail: users sometimes select the wrong Tortoise checkpoint (e.g. clvp2.pth) as the AR model.
    # If the chosen file doesn't look like an AR checkpoint, prefer a local 'autoregressive.*' if present.
    if autoregressive_model_path:
        chosen_base = os.path.basename(autoregressive_model_path).lower()
        looks_like_ar = (
            "autoregressive" in chosen_base
            or chosen_base.endswith("ar.pth")
            or chosen_base.endswith("ar.pt")
        )
        if not looks_like_ar and ar_folder_path:
            for candidate in ("autoregressive.pth", "autoregressive.pt"):
                candidate_path = os.path.join(ar_folder_path, candidate)
                if os.path.exists(candidate_path):
                    if _debug_enabled():
                        print(
                            f"Selected AR model '{autoregressive_model_path}' doesn't look like an autoregressive checkpoint; "
                            f"using '{candidate_path}' instead."
                        )
                    autoregressive_model_path = candidate_path
                    break
            else:
                # Fall back to Tortoise's bundled default if available.
                if _debug_enabled():
                    print(
                        f"Selected AR model '{autoregressive_model_path}' doesn't look like an autoregressive checkpoint; "
                        "falling back to default."
                    )
                autoregressive_model_path = None

    tokenizer_json_path = kwargs.get("tokenizer_json_path")
    if tokenizer_json_path:
        tokenizer_json_path = os.path.join(tokenizer_folder_path, tokenizer_json_path)

    # Defensive: if an invalid tokenizer file is selected (e.g., a dotfile like .gitignore),
    # fall back to Tortoise's built-in tokenizer.
    if tokenizer_json_path:
        basename = os.path.basename(tokenizer_json_path)
        if basename.startswith('.') or not tokenizer_json_path.lower().endswith('.json'):
            tokenizer_json_path = None
        elif not os.path.exists(tokenizer_json_path):
            tokenizer_json_path = None
        else:
            try:
                if os.path.getsize(tokenizer_json_path) == 0:
                    tokenizer_json_path = None
            except OSError:
                tokenizer_json_path = None
        
    diffusion_model_path = kwargs.get("diffusion_model_path", None)
    vocoder_name = kwargs.get("vocoder_name", None)
    use_deepspeed = kwargs.get("use_deepspeed", False)
    use_hifigan = kwargs.get("use_hifigan", False)
    

    tts = load_tortoise_engine(
        autoregressive_model_path=autoregressive_model_path,
        diffusion_model_path=diffusion_model_path,
        vocoder_name=vocoder_name,
        tokenizer_json_path=tokenizer_json_path,
        use_deepspeed=use_deepspeed,
        use_hifigan=use_hifigan
    )
    return tts

def load_with_xtts(**kwargs):
    # Implement loading for xtts TTS engine here
    pass

def load_with_f5tts(**kwargs):
    _require_f5tts()
    engine_name = "f5tts"
    tts_settings = load_tts_config()
    f5tts_engine_config = find_engine_config(engine_name, tts_settings)
    
    model_file = kwargs.get("f5tts_model")
    model_file_root = next((param.folder_path for param in f5tts_engine_config.parameters if param.attribute == "f5tts_model"))
    if model_file:
        model_file_path = os.path.join(model_file_root, model_file)
    else:
        model_file_path=""
        
    tokenizer = kwargs.get("f5tts_tokenizer")
    if tokenizer:
        tokenizer_root = next((param.folder_path for param in f5tts_engine_config.parameters if param.attribute == "f5tts_tokenizer"))
        tokenizer_path = os.path.join(tokenizer_root, tokenizer)
    else:
        tokenizer_path = ""
        
    vocos = kwargs.get("f5tts_vocoder", "vocos")
    vocos_local_path = next((param.folder_path for param in f5tts_engine_config.parameters if param.attribute == "f5tts_vocoder"))
    
    duration_model = kwargs.get("f5tts_duration_model", False)
    duration_model_path = next((param.folder_path for param in f5tts_engine_config.parameters if param.attribute == "f5tts_duration_model"))
    
    model = F5TTS(
        model_type="F5-TTS",
        ckpt_file=model_file_path,
        vocab_file=tokenizer_path,
        ode_method="euler",
        use_ema=True,
        vocoder_name=vocos,
        vocos_local_path=vocos_local_path,
        model_local_path=model_file_root,
        duration_model=duration_model,
        duration_model_path=duration_model_path,
        device="cuda"
    )
    return model

def load_with_gpt_sovits(**kwargs):
    global TTS, TTS_Config
    if TTS is None or TTS_Config is None:
        try:
            from GPT_SoVITS.TTS_infer_pack.TTS import TTS as _TTS, TTS_Config as _TTS_Config
            TTS, TTS_Config = _TTS, _TTS_Config
        except Exception as e:
            raise ImportError(
                "GPT-SoVITS could not be imported, so the 'gpt_sovits' engine cannot be loaded. "
                "Run the install/update script (or check 'modules/GPT-SoVITS-Package' dependencies)."
            ) from e

    tts_settings = load_tts_config()
    gpt_sovits_engine_config = find_engine_config("gpt_sovits", tts_settings)
    version = kwargs.get("gpt_sovits_version")
    
    config_path = "engines/gpt_sovits/tts_configs.yaml"
    
    with open(config_path, 'r') as f:
        import yaml
        raw_config = yaml.safe_load(f)
        
    v1_config = raw_config.get('v1', {})
    v2_config = raw_config.get('v2', {})
    v3_config = raw_config.get('v3', {})
    v4_config = raw_config.get('v4', {})
    TTS_Config.default_configs.update({"v1": v1_config, "v2": v2_config, "v3": v3_config, "v4": v4_config})
    
    with open("configs/settings.yaml", "r") as f:
        settings = yaml.safe_load(f)
    local_files_only = settings.get("auto_download_gpt_sovits", False)
    local_files_only = not local_files_only
    
    cfg = TTS_Config(config_path, local_files_only=local_files_only)
    
    t2s_ckpt = kwargs.get("gpt_sovits_model")
    if t2s_ckpt:
        t2s_ckpt_root_path = next(param.folder_path for param in gpt_sovits_engine_config.parameters if param.attribute == "gpt_sovits_model")
        t2s_ckpt_path = os.path.join(t2s_ckpt_root_path, t2s_ckpt)
    else:
        config = raw_config.get(version, {})
        t2s_ckpt_path = config.get("t2s_weights_path")
    
    vits_ckpt = kwargs.get("gpt_sovits_vits_model")
    if vits_ckpt:
        vits_ckpt_root_path = next(param.folder_path for param in gpt_sovits_engine_config.parameters if param.attribute == "gpt_sovits_vits_model")
        vits_ckpt_path = os.path.join(vits_ckpt_root_path, vits_ckpt)
    else:
        config = raw_config.get(version, {})
        vits_ckpt_path = config.get("vits_weights_path")
        
    from GPT_SoVITS.process_ckpt import get_sovits_version_from_path_fast
    _, model_version, if_lora_v3 = get_sovits_version_from_path_fast(vits_ckpt_path)
    
    pipeline = TTS(cfg)
    if model_version in ["v1", "v2"]:
        pipeline.init_t2s_weights(t2s_ckpt_path)
        pipeline.init_vits_weights(vits_ckpt_path)
    else: #v3, v4
        # Convert paths to absolute for correct lookup
        t2s_ckpt_path = os.path.abspath(t2s_ckpt_path)
        vits_ckpt_path = os.path.abspath(vits_ckpt_path)
        if version == "v4":
            vocoder_path = "engines/gpt_sovits/pretrained_models/gsv-v4-pretrained/vocoder.pth"
        else:
            vocoder_path = "engines/gpt_sovits/pretrained_models/models--nvidia--bigvgan_v2_24khz_100band_256x"
        if _debug_enabled():
            print(f"Loading TTS weights from {t2s_ckpt_path}")
            print(f"Loading VITS weights from {vits_ckpt_path}")
            print(f"Loading Vocoder weights from {vocoder_path}")
        pipeline.init_t2s_weights(t2s_ckpt_path)
        pipeline.init_vits_weights(vits_ckpt_path, vocoder_path=vocoder_path, model_version=version)
    return pipeline

#################################################
############### Utility Functions ###############
#################################################

def find_engine_config(engine_name, tts_settings):
    for engine in tts_settings.tts_engines:
        if engine.name.lower() == engine_name.lower():
            engine_config = engine
            return engine_config

def load_tts_config(path="configs/tts_config.json"):
    tts_config = load_config(path)
    tts_settings = dict_to_object(tts_config)
    return tts_settings

def load_config(config_path):
    if not os.path.exists(config_path):
        return {}
    with open(config_path, 'r') as f:
        return json.load(f)
    
# borrowed from https://github.com/ex3ndr/supervoice-gpt/blob/5c316bdbc7c70164ac4fe9a9a826976c4f546b0d/supervoice_gpt/misc.py#L4
# modified for lists
def dict_to_object(src):
    class DictToObject:
        def __init__(self, dictionary):
            for key, value in dictionary.items():
                # If value is a dictionary, convert it recursively
                if isinstance(value, dict):
                    value = DictToObject(value)
                # If value is a list, convert any dictionaries within the list recursively
                elif isinstance(value, list):
                    value = [DictToObject(item) if isinstance(item, dict) else item for item in value]
                self.__dict__[key] = value

        def __repr__(self):
            return f"{self.__dict__}"

    return DictToObject(src)
