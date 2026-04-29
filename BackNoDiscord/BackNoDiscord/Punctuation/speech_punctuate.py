#!/usr/bin/env python3
import json
import sys

_model = None


def get_model():
    global _model
    if _model is None:
        from deepmultilingualpunctuation import PunctuationModel

        _model = PunctuationModel()
    return _model


def punctuate_with_model(text: str):
    return get_model().restore_punctuation(text)

def handle_payload(raw_payload: str):
    payload = json.loads(raw_payload or "{}")
    text = str(payload.get("text") or "").strip()

    if not text:
        return {"text": "", "provider": "empty", "usedModel": False}

    try:
        punctuated = punctuate_with_model(text)
        return {
            "text": punctuated,
            "provider": "deepmultilingualpunctuation",
            "usedModel": True,
        }
    except Exception as error:
        return {
            "text": text,
            "provider": f"python-fallback:{error.__class__.__name__}",
            "usedModel": False,
        }


def write_response(response):
    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def run_server():
    get_model()
    for line in sys.stdin:
        raw_payload = line.strip()
        if not raw_payload:
            continue
        write_response(handle_payload(raw_payload))


def main():
    if "--server" in sys.argv:
        run_server()
        return

    raw_payload = sys.stdin.read().strip()
    response = handle_payload(raw_payload)
    sys.stdout.write(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()
