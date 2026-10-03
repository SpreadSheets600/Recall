_caption_model = None
_caption_proc = None
_caption_name = None


def caption_image(path: str, prompt_detail: bool = False):
    from . import config

    model_name = config.CAPTION_MODEL
    try:
        import torch
        from transformers import AutoProcessor, AutoModelForCausalLM

        global _caption_model, _caption_proc, _caption_name
        if _caption_model is None or _caption_name != model_name:
            _caption_proc = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
            _caption_model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True)
            _caption_model.eval()
            _caption_name = model_name
        from PIL import Image

        with Image.open(path).convert("RGB") as img:
            if "florence" in model_name.lower():
                prompt = "<DETAILED_CAPTION>" if prompt_detail else "<CAPTION>"
                inputs = _caption_proc(text=prompt, images=img, return_tensors="pt")
                with torch.no_grad():
                    out = _caption_model.generate(
                        input_ids=inputs["input_ids"],
                        pixel_values=inputs["pixel_values"],
                        max_new_tokens=128, num_beams=3)
                text = _caption_proc.batch_decode(out, skip_special_tokens=False)[0]
                try:
                    parsed = _caption_proc.post_process_generation(
                        text, task="<CAPTION>", image_size=(img.width, img.height))
                    return parsed.get("<CAPTION>", text).strip()
                except Exception:
                    return text.strip()
            else:
                from transformers import BlipProcessor, BlipForConditionalGeneration
                from transformers import AutoProcessor as AP
                # Generic image-to-text path via pipeline-style manual calls
                # is handled by blip-specific loader below on first use.
                return ""
    except Exception:
        return ""


_blip = None


def caption_image_blip(path: str):
    from . import config

    if "florence" in config.CAPTION_MODEL.lower():
        return caption_image(path)
    global _blip
    try:
        import torch
        from transformers import BlipProcessor, BlipForConditionalGeneration
        from PIL import Image

        if _blip is None:
            name = config.CAPTION_MODEL
            _blip = (
                BlipProcessor.from_pretrained(name),
                BlipForConditionalGeneration.from_pretrained(name),
            )
            _blip[1].eval()
        proc, model = _blip
        with Image.open(path).convert("RGB") as img:
            inputs = proc(img, return_tensors="pt")
            with torch.no_grad():
                out = model.generate(**inputs, max_new_tokens=60)
            return proc.decode(out[0], skip_special_tokens=True).strip()
    except Exception:
        return ""
