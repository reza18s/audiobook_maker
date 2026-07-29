# tts_engines.py

import json
import importlib
import importlib.metadata
import os
import sys


class EngineUnavailable(RuntimeError):
    pass


LEGACY_F5TTS_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "modules", "F5-TTS", "src")
)
F5TTS_1_1_22_VERSION = "1.1.22"

_active_f5tts_version = None


def _require_f5tts(version):
    global _active_f5tts_version

    if _active_f5tts_version == version and "f5_tts.api" in sys.modules:
        from f5_tts.api import F5TTS as f5tts_class

        return f5tts_class

    _active_f5tts_version = None
    for module_name in tuple(sys.modules):
        if module_name == "f5_tts" or module_name.startswith("f5_tts."):
            del sys.modules[module_name]

    while LEGACY_F5TTS_PATH in sys.path:
        sys.path.remove(LEGACY_F5TTS_PATH)

    if version == "legacy":
        if not os.path.isdir(LEGACY_F5TTS_PATH):
            raise EngineUnavailable(
                "Legacy F5-TTS is not available. Initialize modules/F5-TTS."
            )
        sys.path.insert(0, LEGACY_F5TTS_PATH)
    elif version == F5TTS_1_1_22_VERSION:
        try:
            installed_version = importlib.metadata.version("f5-tts")
        except importlib.metadata.PackageNotFoundError as error:
            raise EngineUnavailable(
                "F5-TTS 1.1.22 is not installed. Run: pip install f5-tts==1.1.22"
            ) from error
        if installed_version != F5TTS_1_1_22_VERSION:
            raise EngineUnavailable(
                "F5-TTS 1.1.22 is required for this engine, but "
                f"version {installed_version} is installed."
            )
    else:
        raise EngineUnavailable(f"Unsupported F5-TTS version: {version}")

    importlib.invalidate_caches()
    try:
        from f5_tts.api import F5TTS as f5tts_class
    except Exception as error:
        raise EngineUnavailable(
            f"F5-TTS {version} could not be imported. Install its dependencies."
        ) from error
    _active_f5tts_version = version
    return f5tts_class


def generate_audio(tts_engine, sentence, voice_parameters, tts_engine_name, audio_path):
    engine_name = tts_engine_name.lower()
    if engine_name == "f5tts":
        return generate_with_f5tts(tts_engine, sentence, voice_parameters, audio_path)
    if engine_name == "f5tts 1.1.22":
        return generate_with_f5tts_1_1_22(
            tts_engine, sentence, voice_parameters, audio_path
        )
    raise EngineUnavailable(f"Unsupported TTS engine: {tts_engine_name}")


def generate_with_f5tts(tts_engine, sentence, voice_parameters, audio_path):
    _require_f5tts("legacy")
    engine_config = find_engine_config("f5tts", load_tts_config())

    reference_audio, reference_text = _load_voice_reference(
        engine_config, voice_parameters.get("f5tts_voice"), "f5tts_voice"
    )
    speed = _get_speed(engine_config, voice_parameters, "f5tts_speed")

    tts_engine.infer(
        ref_file=reference_audio,
        ref_text=reference_text,
        gen_text=sentence,
        file_wave=audio_path,
        speed=speed,
        seed=voice_parameters.get("f5tts_seed", -1),
    )
    return os.path.exists(audio_path)


def generate_with_f5tts_1_1_22(
    tts_engine, sentence, voice_parameters, audio_path
):
    _require_f5tts(F5TTS_1_1_22_VERSION)
    engine_config = find_engine_config("f5tts 1.1.22", load_tts_config())
    reference_audio, reference_text = _load_voice_reference(
        engine_config,
        voice_parameters.get("f5tts_1_1_22_voice"),
        "f5tts_1_1_22_voice",
    )
    speed = _get_speed(
        engine_config, voice_parameters, "f5tts_1_1_22_speed"
    )
    seed = voice_parameters.get("f5tts_1_1_22_seed", -1)

    tts_engine.infer(
        ref_file=reference_audio,
        ref_text=reference_text,
        gen_text=sentence,
        file_wave=audio_path,
        speed=speed,
        seed=None if seed == -1 else seed,
    )
    return os.path.exists(audio_path)


def load_tts_engine(tts_engine_name, **kwargs):
    engine_name = tts_engine_name.lower()
    if engine_name == "f5tts":
        return load_with_f5tts(**kwargs)
    if engine_name == "f5tts 1.1.22":
        return load_with_f5tts_1_1_22(**kwargs)
    raise EngineUnavailable(f"Unsupported TTS engine: {tts_engine_name}")


def load_with_f5tts(**kwargs):
    f5tts_class = _require_f5tts("legacy")
    engine_config = find_engine_config("f5tts", load_tts_config())

    model_root = next(
        parameter.folder_path
        for parameter in engine_config.parameters
        if parameter.attribute == "f5tts_model"
    )
    model_name = kwargs.get("f5tts_model")
    model_path = os.path.join(model_root, model_name) if model_name else ""

    tokenizer_name = kwargs.get("f5tts_tokenizer")
    if tokenizer_name:
        tokenizer_root = next(
            parameter.folder_path
            for parameter in engine_config.parameters
            if parameter.attribute == "f5tts_tokenizer"
        )
        tokenizer_path = os.path.join(tokenizer_root, tokenizer_name)
    else:
        tokenizer_path = ""

    vocoder_path = next(
        parameter.folder_path
        for parameter in engine_config.parameters
        if parameter.attribute == "f5tts_vocoder"
    )
    duration_model_path = next(
        parameter.folder_path
        for parameter in engine_config.parameters
        if parameter.attribute == "f5tts_duration_model"
    )

    return f5tts_class(
        model_type="F5-TTS",
        ckpt_file=model_path,
        vocab_file=tokenizer_path,
        ode_method="euler",
        use_ema=True,
        vocoder_name=kwargs.get("f5tts_vocoder", "vocos"),
        vocos_local_path=vocoder_path,
        model_local_path=model_root,
        duration_model=kwargs.get("f5tts_duration_model", False),
        duration_model_path=duration_model_path,
        device="cuda",
    )


def load_with_f5tts_1_1_22(**kwargs):
    f5tts_class = _require_f5tts(F5TTS_1_1_22_VERSION)
    engine_config = find_engine_config("f5tts 1.1.22", load_tts_config())
    model_root = os.path.abspath(
        _get_parameter_folder(engine_config, "f5tts_1_1_22_model")
    )
    model_name = kwargs.get("f5tts_1_1_22_model")
    model_path = (
        os.path.join(model_root, model_name)
        if model_name and model_name != "Default"
        else ""
    )

    tokenizer_name = kwargs.get("f5tts_1_1_22_tokenizer")
    tokenizer_path = ""
    if tokenizer_name and tokenizer_name != "Default":
        tokenizer_root = os.path.abspath(
            _get_parameter_folder(engine_config, "f5tts_1_1_22_tokenizer")
        )
        tokenizer_path = os.path.join(tokenizer_root, tokenizer_name)

    return f5tts_class(
        model="F5TTS_v1_Base",
        ckpt_file=model_path,
        vocab_file=tokenizer_path,
        ode_method="euler",
        use_ema=True,
        device="cuda",
        hf_cache_dir=model_root,
    )


def _get_parameter_folder(engine_config, attribute):
    return next(
        parameter.folder_path
        for parameter in engine_config.parameters
        if parameter.attribute == attribute
    )


def _load_voice_reference(engine_config, voice_name, attribute):
    if not voice_name:
        raise EngineUnavailable("Select an F5-TTS reference voice.")
    voice_root = _get_parameter_folder(engine_config, attribute)
    reference_audio = os.path.join(voice_root, voice_name, f"{voice_name}.wav")
    reference_text_path = os.path.join(
        voice_root, voice_name, f"{voice_name}.txt"
    )
    with open(reference_text_path, "r", encoding="utf-8") as reference_file:
        reference_text = reference_file.readline()
    return reference_audio, reference_text


def _get_speed(engine_config, voice_parameters, attribute):
    speed_step = next(
        (
            parameter.step
            for parameter in engine_config.parameters
            if parameter.attribute == attribute
        ),
        100,
    )
    return round(voice_parameters.get(attribute, 100) / speed_step, 2)


def find_engine_config(engine_name, tts_settings):
    for engine in tts_settings.tts_engines:
        if engine.name.lower() == engine_name.lower():
            return engine
    raise EngineUnavailable(f"TTS configuration not found: {engine_name}")


def load_tts_config(path="configs/tts_config.json"):
    with open(path, "r", encoding="utf-8") as config_file:
        return dict_to_object(json.load(config_file))


def dict_to_object(source):
    class DictToObject:
        def __init__(self, dictionary):
            for key, value in dictionary.items():
                if isinstance(value, dict):
                    value = DictToObject(value)
                elif isinstance(value, list):
                    value = [
                        DictToObject(item) if isinstance(item, dict) else item
                        for item in value
                    ]
                self.__dict__[key] = value

    return DictToObject(source)
