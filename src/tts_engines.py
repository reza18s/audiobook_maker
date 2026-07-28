# tts_engines.py

import json
import os
import sys


class EngineUnavailable(RuntimeError):
    pass


def _add_module_path(relative_path):
    module_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "modules", relative_path)
    )
    if os.path.isdir(module_path) and module_path not in sys.path:
        sys.path.insert(0, module_path)


_add_module_path("F5-TTS")

F5TTS = None


def _require_f5tts():
    global F5TTS
    if F5TTS is not None:
        return F5TTS
    try:
        from f5_tts.api import F5TTS as f5tts_class
    except Exception as error:
        raise EngineUnavailable(
            "F5-TTS is not available. Install modules/F5-TTS and its dependencies."
        ) from error
    F5TTS = f5tts_class
    return F5TTS


def generate_audio(tts_engine, sentence, voice_parameters, tts_engine_name, audio_path):
    if tts_engine_name.lower() != "f5tts":
        raise EngineUnavailable(f"Unsupported TTS engine: {tts_engine_name}")
    return generate_with_f5tts(tts_engine, sentence, voice_parameters, audio_path)


def generate_with_f5tts(tts_engine, sentence, voice_parameters, audio_path):
    _require_f5tts()
    engine_config = find_engine_config("f5tts", load_tts_config())

    voice_name = voice_parameters.get("f5tts_voice")
    voice_root = next(
        parameter.folder_path
        for parameter in engine_config.parameters
        if parameter.attribute == "f5tts_voice"
    )
    reference_audio = os.path.join(voice_root, voice_name, f"{voice_name}.wav")
    reference_text_path = os.path.join(voice_root, voice_name, f"{voice_name}.txt")
    with open(reference_text_path, "r", encoding="utf-8") as reference_file:
        reference_text = reference_file.readline()

    speed_step = next(
        (
            parameter.step
            for parameter in engine_config.parameters
            if parameter.attribute == "f5tts_speed"
        ),
        100,
    )
    speed = round(voice_parameters.get("f5tts_speed", 100) / speed_step, 2)

    tts_engine.infer(
        ref_file=reference_audio,
        ref_text=reference_text,
        gen_text=sentence,
        file_wave=audio_path,
        speed=speed,
        seed=voice_parameters.get("f5tts_seed", -1),
    )
    return os.path.exists(audio_path)


def load_tts_engine(tts_engine_name, **kwargs):
    if tts_engine_name.lower() != "f5tts":
        raise EngineUnavailable(f"Unsupported TTS engine: {tts_engine_name}")
    return load_with_f5tts(**kwargs)


def load_with_f5tts(**kwargs):
    f5tts_class = _require_f5tts()
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
