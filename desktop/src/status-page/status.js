const elements = {
  version: document.getElementById("version"),
  runnerDot: document.getElementById("runner-dot"),
  runnerStatus: document.getElementById("runner-status"),
  runnerDetail: document.getElementById("runner-detail"),
  observerDot: document.getElementById("observer-dot"),
  observerStatus: document.getElementById("observer-status"),
  openObserver: document.getElementById("open-observer"),
  codexDot: document.getElementById("codex-dot"),
  codexStatus: document.getElementById("codex-status"),
  configDot: document.getElementById("config-dot"),
  configStatus: document.getElementById("config-status"),
  dataRoot: document.getElementById("data-root"),
  openDataRoot: document.getElementById("open-data-root"),
  checkUpdates: document.getElementById("check-updates"),
};

elements.openObserver.addEventListener("click", () => {
  void window.agentMoebius.openObserver();
});
elements.openDataRoot.addEventListener("click", () => {
  void window.agentMoebius.openDataRoot();
});
elements.checkUpdates.addEventListener("click", () => {
  void window.agentMoebius.checkUpdates();
});

window.agentMoebius.onStatus((snapshot) => {
  elements.version.textContent = `v${snapshot.appVersion}`;
  elements.dataRoot.textContent = snapshot.dataRoot;
  renderRunner(snapshot.runner);
  renderObserver(snapshot.observer);
  renderDoctor(snapshot);
});

function renderRunner(runner) {
  const dot = elements.runnerDot;
  dot.className = "dot";
  if (runner.status === "running") {
    dot.classList.add("ok");
    elements.runnerStatus.textContent = "运行中";
  } else if (runner.status === "starting") {
    dot.classList.add("warn");
    elements.runnerStatus.textContent = "启动中";
  } else if (runner.status === "crashed" && runner.nextRestartDelayMs !== undefined) {
    dot.classList.add("warn");
    elements.runnerStatus.textContent = `已崩溃，第 ${runner.crashCount}/${runner.maxCrashCount} 次重启中`;
  } else if (runner.status === "crashed") {
    dot.classList.add("error");
    elements.runnerStatus.textContent = `已停止（连续崩溃 ${runner.crashCount} 次）`;
  } else {
    dot.classList.add("muted");
    elements.runnerStatus.textContent = "已停止";
  }

  if (runner.logPath !== undefined && runner.status === "crashed") {
    elements.runnerDetail.textContent = `日志：${runner.logPath}`;
    elements.runnerDetail.classList.remove("hidden");
  } else {
    elements.runnerDetail.textContent = "";
    elements.runnerDetail.classList.add("hidden");
  }
}

function renderObserver(observer) {
  elements.observerDot.className = "dot";
  if (observer.status === "running") {
    elements.observerDot.classList.add("ok");
    elements.observerStatus.textContent = observer.url?.replace("http://", "") ?? "运行中";
    elements.openObserver.disabled = false;
  } else if (observer.status === "error") {
    elements.observerDot.classList.add("error");
    elements.observerStatus.textContent = observer.error ?? "启动失败";
    elements.openObserver.disabled = true;
  } else {
    elements.observerDot.classList.add("warn");
    elements.observerStatus.textContent = "启动中";
    elements.openObserver.disabled = true;
  }
}

function renderDoctor(snapshot) {
  renderCheck(elements.codexDot, elements.codexStatus, snapshot.doctor?.codex, "检测中");

  elements.configDot.className = "dot";
  if (snapshot.seed.status === "ok") {
    elements.configDot.classList.add("ok");
    elements.configStatus.textContent = snapshot.seed.skipped === 0 ? "已初始化" : "已保留本地文件";
  } else if (snapshot.seed.status === "error") {
    elements.configDot.classList.add("error");
    elements.configStatus.textContent = snapshot.seed.error ?? "初始化失败";
  } else {
    elements.configDot.classList.add("muted");
    elements.configStatus.textContent = "初始化中";
  }
}

function renderCheck(dot, text, check, pendingText) {
  dot.className = "dot";
  if (check === undefined || check === null) {
    dot.classList.add("muted");
    text.textContent = pendingText;
    return;
  }
  if (check.status === "ok") {
    dot.classList.add("ok");
  } else {
    dot.classList.add("error");
  }
  text.textContent = check.message;
}
