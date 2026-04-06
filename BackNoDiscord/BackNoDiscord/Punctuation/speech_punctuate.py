#!/usr/bin/env python3
import json
import sys


def punctuate_with_model(text: str):
    from deepmultilingualpunctuation import PunctuationModel

    model = PunctuationModel()
    return model.restore_punctuation(text)


def main():
    raw_payload = sys.stdin.read().strip()
    payload = json.loads(raw_payload or "{}")
    text = str(payload.get("text") or "").strip()

    if not text:
        sys.stdout.write(json.dumps({"text": "", "provider": "empty", "usedModel": False}, ensure_ascii=False))
        return

    try:
        punctuated = punctuate_with_model(text)
        sys.stdout.write(
            json.dumps(
                {
                    "text": punctuated,
                    "provider": "deepmultilingualpunctuation",
                    "usedModel": True,
                },
                ensure_ascii=False,
            )
        )
    except Exception as error:
        sys.stdout.write(
            json.dumps(
                {
                    "text": text,
                    "provider": f"python-fallback:{error.__class__.__name__}",
                    "usedModel": False,
                },
                ensure_ascii=False,
            )
        )


if __name__ == "__main__":
    main()
