import { useEffect, useMemo, useState } from "react";
import { DEFAULT_POLL_THEME_ID, POLL_THEME_PRESETS } from "../utils/pollMessages";

const DEFAULT_SETTINGS = {
  showWhoVoted: true,
  allowMultipleAnswers: false,
  allowAddingOptions: false,
  allowRevoting: false,
  shuffleOptions: false,
  quizMode: false,
  limitDuration: false,
};

const SETTINGS_ITEMS = [
  {
    key: "showWhoVoted",
    title: "Показывать голоса",
    description: "Показывать, кто проголосовал за вариант.",
    accentClassName: "poll-composer__setting-icon--blue",
  },
  {
    key: "allowMultipleAnswers",
    title: "Несколько ответов",
    description: "Разрешить выбрать сразу несколько вариантов.",
    accentClassName: "poll-composer__setting-icon--gold",
  },
  {
    key: "allowAddingOptions",
    title: "Разрешить добавление вариантов",
    description: "Участники смогут предложить свои варианты.",
    accentClassName: "poll-composer__setting-icon--cyan",
  },
  {
    key: "allowRevoting",
    title: "Разрешить переголосование",
    description: "Можно будет изменить свой выбор после голосования.",
    accentClassName: "poll-composer__setting-icon--purple",
  },
  {
    key: "shuffleOptions",
    title: "Перемешать варианты",
    description: "Для каждого пользователя порядок будет случайным.",
    accentClassName: "poll-composer__setting-icon--orange",
  },
  {
    key: "quizMode",
    title: "Правильный ответ",
    description: "Подходит для викторин и тестов.",
    accentClassName: "poll-composer__setting-icon--green",
  },
  {
    key: "limitDuration",
    title: "Ограничить время",
    description: "Автоматически закрыть опрос через заданный срок.",
    accentClassName: "poll-composer__setting-icon--red",
  },
];

function createDefaultOptions() {
  return [
    { id: "option-1", text: "" },
    { id: "option-2", text: "" },
  ];
}

export default function TextChatPollComposerModal({
  open,
  onClose,
  onSubmit,
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(() => createDefaultOptions());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [themeId, setThemeId] = useState(DEFAULT_POLL_THEME_ID);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuestion("");
      setOptions(createDefaultOptions());
      setSettings(DEFAULT_SETTINGS);
      setThemeId(DEFAULT_POLL_THEME_ID);
      setSubmitting(false);
    }
  }, [open]);

  const normalizedOptions = useMemo(
    () => options.map((option) => ({ ...option, text: String(option?.text || "") })),
    [options]
  );

  if (!open) {
    return null;
  }

  const canAddOption = normalizedOptions.length < 12;
  const filledOptionCount = normalizedOptions.filter((option) => option.text.trim()).length;
  const canSubmit = question.trim().length > 0 && filledOptionCount >= 2 && !submitting;

  const updateOption = (optionId, nextText) => {
    setOptions((previous) => previous.map((option) => (
      option.id === optionId
        ? { ...option, text: nextText }
        : option
    )));
  };

  const addOption = () => {
    if (!canAddOption) {
      return;
    }

    setOptions((previous) => [
      ...previous,
      { id: `option-${previous.length + 1}`, text: "" },
    ]);
  };

  const removeOption = (optionId) => {
    setOptions((previous) => {
      if (previous.length <= 2) {
        return previous;
      }

      return previous.filter((option) => option.id !== optionId);
    });
  };

  const toggleSetting = (settingKey) => {
    setSettings((previous) => ({
      ...previous,
      [settingKey]: !previous[settingKey],
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit || typeof onSubmit !== "function") {
      return;
    }

    setSubmitting(true);
    try {
      const result = await onSubmit({
        question,
        options: normalizedOptions.filter((option) => option.text.trim()),
        settings,
        themeId,
      });

      if (result !== false) {
        onClose?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="poll-composer-backdrop" onClick={onClose} role="presentation">
      <div
        className="poll-composer-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Создать опрос"
      >
        <div className="poll-composer__header">
          <div>
            <h3>Новый опрос</h3>
            <p>Соберите быстрый опрос прямо в чате.</p>
          </div>
          <button type="button" className="poll-composer__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="poll-composer__section">
          <label className="poll-composer__field">
            <span className="poll-composer__label">Вопрос</span>
            <textarea
              className="poll-composer__textarea"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="О чём голосуем?"
              rows={3}
              maxLength={220}
            />
          </label>
        </div>

        <div className="poll-composer__section">
          <div className="poll-composer__label-row">
            <span className="poll-composer__label">Цвет фона</span>
            <span className="poll-composer__hint">Выберите тему карточки опроса.</span>
          </div>

          <div className="poll-composer__themes" role="listbox" aria-label="Цвет фона опроса">
            {POLL_THEME_PRESETS.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`poll-composer__theme-swatch ${themeId === theme.id ? "poll-composer__theme-swatch--active" : ""}`}
                style={{ "--poll-theme-preview": theme.cardBackground }}
                onClick={() => setThemeId(theme.id)}
                aria-label={`Тема ${theme.label}`}
                aria-selected={themeId === theme.id}
              >
                <span className="poll-composer__theme-preview" aria-hidden="true" />
                <span className="poll-composer__theme-name">{theme.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="poll-composer__section">
          <div className="poll-composer__label-row">
            <span className="poll-composer__label">Варианты ответа</span>
            <span className="poll-composer__hint">Можно до 12 вариантов.</span>
          </div>

          <div className="poll-composer__options">
            {normalizedOptions.map((option, index) => (
              <div key={option.id} className="poll-composer__option">
                <span className="poll-composer__drag" aria-hidden="true" />
                <input
                  className="poll-composer__option-input"
                  type="text"
                  value={option.text}
                  onChange={(event) => updateOption(option.id, event.target.value)}
                  placeholder={`Вариант ${index + 1}`}
                  maxLength={120}
                />
                <button
                  type="button"
                  className="poll-composer__option-remove"
                  onClick={() => removeOption(option.id)}
                  disabled={normalizedOptions.length <= 2}
                  aria-label="Удалить вариант"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="poll-composer__add-option" onClick={addOption} disabled={!canAddOption}>
            <span className="poll-composer__add-option-icon" aria-hidden="true">+</span>
            <span>Добавить вариант</span>
          </button>
        </div>

        <div className="poll-composer__section">
          <div className="poll-composer__label-row">
            <span className="poll-composer__label">Настройки</span>
          </div>

          <div className="poll-composer__settings">
            {SETTINGS_ITEMS.map((item) => (
              <label key={item.key} className="poll-composer__setting">
                <span className={`poll-composer__setting-icon ${item.accentClassName}`} aria-hidden="true" />
                <span className="poll-composer__setting-copy">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="poll-composer__toggle">
                  <input
                    type="checkbox"
                    checked={settings[item.key]}
                    onChange={() => toggleSetting(item.key)}
                  />
                  <span className="poll-composer__toggle-track" aria-hidden="true" />
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="poll-composer__actions">
          <button type="button" className="poll-composer__button poll-composer__button--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="poll-composer__button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Создаём..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
