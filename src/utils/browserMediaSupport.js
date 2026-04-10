function getUserAgent() {
  if (typeof navigator === "undefined") {
    return "";
  }

  return String(navigator.userAgent || "");
}

export function isIphoneSafari() {
  const userAgent = getUserAgent();
  const isIphone = /iPhone/i.test(userAgent);
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
  return isIphone && isSafari;
}

export function getDisplayCaptureSupportInfo() {
  if (typeof window === "undefined") {
    return {
      supported: false,
      status: "unsupported",
      title: "Стрим экрана недоступен",
      subtitle: "Браузер ещё не инициализировал доступ к захвату экрана.",
    };
  }

  if (window.electronScreenCapture?.getSources) {
    return {
      supported: true,
      status: "supported",
      title: "Запустить стрим экрана",
      subtitle: "Показать участникам окно, экран или приложение.",
    };
  }

  const hasDisplayCapture = typeof navigator?.mediaDevices?.getDisplayMedia === "function";
  if (!hasDisplayCapture) {
    return {
      supported: false,
      status: "unsupported",
      title: "Стрим экрана недоступен",
      subtitle: "Этот браузер не поддерживает захват экрана.",
    };
  }

  if (isIphoneSafari()) {
    return {
      supported: false,
      status: "platform-limited",
      title: "Стрим экрана недоступен на iPhone Safari",
      subtitle: "Safari на iPhone не даёт стабильно запустить захват экрана из веб-приложения.",
    };
  }

  return {
    supported: true,
    status: "supported",
    title: "Запустить стрим экрана",
    subtitle: "Показать участникам экран телефона, вкладку браузера или приложение.",
  };
}
