import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Code2,
  Copy,
  FileCode2,
  FlaskConical,
  FolderPlus,
  MessageSquarePlus,
  Moon,
  Play,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
  X
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion
} from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { createRoot } from "react-dom/client";

import {
  EASE_OUT,
  PrototypeButton,
  SPRING_LAYOUT
} from "./beui-button.js";
import {
  canContinue,
  initialOnboardingState,
  onboardingReducer,
  type EnvironmentState,
  type OnboardingStep
} from "./onboarding-state.js";
import "./styles.css";

const RELAY_STAGES = [
  {
    role: "开发经理",
    eyebrow: "拆解目标",
    title: "把需求收束成可执行方案",
    detail: "明确边界、风险和验收口径，再把实现交给开发。",
    node: 0
  },
  {
    role: "开发",
    eyebrow: "实现",
    title: "按方案完成修改",
    detail: "实现核心路径，同时保留可以复核的命令和改动证据。",
    node: 1
  },
  {
    role: "测试",
    eyebrow: "独立复核",
    title: "发现一个边界状态遗漏",
    detail: "测试没有重复实现，而是带着具体证据把问题交回开发。",
    node: 2
  },
  {
    role: "开发",
    eyebrow: "修正",
    title: "补齐边界并重新验证",
    detail: "修正完成后携带最新结果重新交给测试，不跳过独立复核。",
    node: 1
  },
  {
    role: "测试",
    eyebrow: "再次复核",
    title: "边界状态已覆盖，验证通过",
    detail: "测试确认问题已经解决，并把可复核的结果交回主 Agent。",
    node: 2
  },
  {
    role: "开发经理",
    eyebrow: "带证据收尾",
    title: "整合改动与复核结果，向你收尾",
    detail: "团队内部闭环结束；你看到的不只是完成声明，还有测试通过的依据。",
    node: 0
  }
] as const;

const NODE_META = [
  {
    name: "开发经理",
    short: "经",
    icon: Users
  },
  {
    name: "开发",
    short: "开",
    icon: Code2
  },
  {
    name: "测试",
    short: "测",
    icon: FlaskConical
  }
] as const;

function App() {
  const search = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const initialEnvironment: EnvironmentState =
    search.get("scenario") === "missing" ? "missing" : "ready";
  const [state, dispatch] = useReducer(
    onboardingReducer,
    initialEnvironment,
    initialOnboardingState
  );
  const [theme, setTheme] = useState<"dark" | "light">(
    search.get("theme") === "light" ? "light" : "dark"
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }, [state.view]);

  const continueJourney = useCallback(() => {
    dispatch({ type: "continue" });
  }, []);

  const recheck = useCallback(() => {
    dispatch({ type: "set-environment", value: "checking" });
    window.setTimeout(() => {
      dispatch({ type: "set-environment", value: "ready" });
    }, 780);
  }, []);

  const copyInstallCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText("brew install codex");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <div className="prototype-root">
      <ReviewControls
        open={reviewOpen}
        theme={theme}
        onToggleOpen={() => setReviewOpen((current) => !current)}
        onThemeChange={setTheme}
        onScenarioChange={(environment) => {
          dispatch({ type: "reset", environment });
          setReviewOpen(false);
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {state.view === "conversation" ? (
          <ConversationDestination
            key="conversation"
            teamName={state.selectedTeam.name}
            titleRef={titleRef}
            onRestart={() => dispatch({ type: "reset" })}
          />
        ) : (
          <OnboardingShell
            key={`step-${state.view}`}
            step={state.view}
            titleRef={titleRef}
            title={stepTitle(state.view)}
            subtitle={stepSubtitle(state.view)}
            primaryLabel={state.view === 4 ? "开始使用" : "继续"}
            primaryDisabled={!canContinue(state)}
            onPrimary={continueJourney}
            secondary={
              state.view === 1 && state.environment !== "ready" ? (
                <PrototypeButton
                  variant="secondary"
                  onClick={recheck}
                  disabled={state.environment === "checking"}
                  data-testid="recheck"
                >
                  <RefreshCw
                    size={15}
                    className={
                      state.environment === "checking" ? "is-spinning" : ""
                    }
                  />
                  {state.environment === "checking" ? "正在检查" : "重新检查"}
                </PrototypeButton>
              ) : null
            }
          >
            {state.view === 1 ? (
              <EnvironmentStep
                environment={state.environment}
                copied={copied}
                onCopy={copyInstallCommand}
              />
            ) : null}
            {state.view === 2 ? (
              <TeamStep teamName={state.selectedTeam.name} />
            ) : null}
            {state.view === 3 ? (
              <RelayStep
                key={state.relayRun}
                run={state.relayRun}
                onReplay={() => dispatch({ type: "replay-relay" })}
              />
            ) : null}
            {state.view === 4 ? (
              <ReadyStep teamName={state.selectedTeam.name} />
            ) : null}
          </OnboardingShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function stepTitle(step: OnboardingStep): string {
  switch (step) {
    case 1:
      return "环境准备";
    case 2:
      return "选择一支团队";
    case 3:
      return "看看他们怎么替你接力";
    case 4:
      return "准备就绪";
  }
}

function stepSubtitle(step: OnboardingStep): string {
  switch (step) {
    case 1:
      return "agent-moebius 用 codex 来运行每一位团队成员";
    case 2:
      return "先选一支最接近你当前工作的团队，之后随时可以切换";
    case 3:
      return "你只说目标，团队会把控制权交给当前最合适的成员";
    case 4:
      return "团队已经就位，说出你的目标就能开工";
  }
}

interface OnboardingShellProps {
  step: OnboardingStep;
  title: string;
  subtitle: string;
  titleRef: React.RefObject<HTMLHeadingElement>;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
  secondary: ReactNode;
  children: ReactNode;
}

function OnboardingShell({
  step,
  title,
  subtitle,
  titleRef,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondary,
  children
}: OnboardingShellProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.main
      className="onboarding-shell"
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, x: 24, filter: "blur(8px)" }
      }
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, x: -18, filter: "blur(6px)" }
      }
      transition={{ duration: reduceMotion ? 0.12 : 0.36, ease: EASE_OUT }}
      data-testid={`step-${step}`}
    >
      <PrototypeChrome />

      <section className="onboarding-stage">
        <div className="stage-heading">
          <motion.div
            className="stage-kicker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.08 }}
          >
            FIRST RUN · {String(step).padStart(2, "0")}
          </motion.div>
          <h1 ref={titleRef} tabIndex={-1}>
            {title}
          </h1>
          <p>{subtitle}</p>
        </div>

        <div className="stage-content">{children}</div>
      </section>

      <footer className="onboarding-footer">
        <div className="footer-inner">
          <StepProgress current={step} />
          <div className="footer-actions">
            {secondary}
            <PrototypeButton
              ripple
              onClick={onPrimary}
              disabled={primaryDisabled}
              data-testid="primary-action"
            >
              {primaryLabel}
              <ArrowRight size={15} />
            </PrototypeButton>
          </div>
        </div>
      </footer>
    </motion.main>
  );
}

function PrototypeChrome() {
  return (
    <header className="prototype-chrome" aria-label="应用标题栏">
      <div className="traffic-lights" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="brand-mark">
        <span className="brand-glyph" aria-hidden>
          M
        </span>
        <span>agent-moebius</span>
      </div>
      <span className="prototype-label">交互原型</span>
    </header>
  );
}

function StepProgress({ current }: { current: OnboardingStep }) {
  return (
    <div className="step-progress" aria-label={`第 ${current} 步，共 4 步`}>
      <div className="step-dots" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={[
              step < current ? "is-complete" : "",
              step === current ? "is-current" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </div>
      <span className="step-count">{current} / 4</span>
    </div>
  );
}

interface EnvironmentStepProps {
  environment: EnvironmentState;
  copied: boolean;
  onCopy: () => void;
}

function EnvironmentStep({
  environment,
  copied,
  onCopy
}: EnvironmentStepProps) {
  if (environment === "ready") {
    return (
      <motion.div
        className="environment-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_LAYOUT, delay: 0.06 }}
      >
        <StatusRow
          icon={<FileCode2 size={17} />}
          label="codex 已安装"
          meta="已在本机找到命令"
        />
        <StatusRow
          icon={<Check size={17} />}
          label="codex 可以运行"
          meta="团队成员已经可以开始工作"
        />
        <div className="ready-note">
          <Sparkles size={14} />
          只检查运行团队所需的 codex，不要求配置 GitHub。
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="environment-card environment-card--error"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_LAYOUT}
    >
      <div className="missing-head">
        <span className="status-icon status-icon--danger">
          <X size={17} />
        </span>
        <div>
          <strong>没有找到 codex</strong>
          <p>先在终端里安装，完成后回到这里重新检查。</p>
        </div>
      </div>

      <div className="install-command">
        <code>brew install codex</code>
        <button
          type="button"
          className="copy-action"
          onClick={onCopy}
          aria-live="polite"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>

      <div className="missing-foot">
        {environment === "checking" ? (
          <>
            <span className="checking-pulse" />
            正在重新确认本机环境…
          </>
        ) : (
          "环境通过前不会进入下一步"
        )}
      </div>
    </motion.div>
  );
}

function StatusRow({
  icon,
  label,
  meta
}: {
  icon: ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <div className="status-row">
      <span className="status-icon status-icon--pass">{icon}</span>
      <div>
        <strong>{label}</strong>
        <span>{meta}</span>
      </div>
      <span className="status-verdict">
        <Check size={13} />
        通过
      </span>
    </div>
  );
}

function TeamStep({ teamName }: { teamName: string }) {
  return (
    <div className="team-list">
      <motion.button
        type="button"
        className="team-card is-selected"
        aria-pressed="true"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_LAYOUT, delay: 0.03 }}
      >
        <div className="team-card__top">
          <div className="team-identity">
            <span className="selection-dot">
              <span />
            </span>
            <div>
              <strong>{teamName}</strong>
              <span>软件内置</span>
            </div>
          </div>
          <span className="selected-label">
            <Check size={13} />
            已选择
          </span>
        </div>

        <div className="team-members">
          {NODE_META.map(({ name, short, icon: Icon }, index) => (
            <div className="member-chip" key={name}>
              <span className="member-avatar">
                <Icon size={13} aria-hidden />
              </span>
              <span>
                <strong>{name}</strong>
                <small>{index === 0 ? "主 Agent" : index === 1 ? "实现" : "复核"}</small>
              </span>
              <span className="sr-only">{short}</span>
            </div>
          ))}
        </div>

        <p>适合方案、实现、审查和验收类任务。</p>
      </motion.button>

      <motion.button
        type="button"
        className="create-team-card is-pending"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_LAYOUT, delay: 0.09 }}
        disabled
        aria-describedby="create-team-prototype-note"
      >
        <span className="create-team-icon">
          <MessageSquarePlus size={18} />
        </span>
        <span>
          <strong>跟 AI 聊出一支新团队</strong>
          <small>说一下想做什么，AI 帮你把成员组齐</small>
        </span>
        <span className="pending-label">流程待讨论</span>
      </motion.button>
      <span id="create-team-prototype-note" className="sr-only">
        此入口的后续流程仍待产品讨论，本原型只确认入口位置。
      </span>
    </div>
  );
}

function RelayStep({ run, onReplay }: { run: number; onReplay: () => void }) {
  const reduceMotion = useReducedMotion();
  const [stageIndex, setStageIndex] = useState(0);
  const stage = RELAY_STAGES[stageIndex];

  useEffect(() => {
    setStageIndex(0);
    const interval = window.setInterval(() => {
      setStageIndex((current) =>
        current >= RELAY_STAGES.length - 1 ? current : current + 1
      );
    }, reduceMotion ? 1100 : 1850);

    return () => window.clearInterval(interval);
  }, [reduceMotion, run]);

  const cursorPosition =
    [16.667, 50, 83.333, 50, 83.333, 16.667][stageIndex] ?? 16.667;

  return (
    <div className="relay-card">
      <div className="relay-topline">
        <div>
          <span className="live-indicator">
            <span />
            团队接力演示
          </span>
          <strong>开发团队</strong>
        </div>
        <button
          type="button"
          className="replay-action"
          onClick={onReplay}
          data-testid="replay-relay"
        >
          <Play size={13} />
          重新播放
        </button>
      </div>

      <div className="relay-track" aria-label="开发团队接力顺序">
        <div className="relay-line" aria-hidden>
          <span />
        </div>
        <motion.div
          className="relay-cursor"
          aria-hidden
          animate={{ left: `${cursorPosition}%` }}
          transition={reduceMotion ? { duration: 0 } : SPRING_LAYOUT}
        />

        {NODE_META.map(({ name, short, icon: Icon }, index) => {
          const active = index === stage.node;
          const visited =
            stageIndex >=
            RELAY_STAGES.findIndex((relayStage) => relayStage.node === index);
          return (
            <div
              className={[
                "relay-node",
                active ? "is-active" : "",
                visited ? "is-visited" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={name}
            >
              <motion.span
                className="relay-avatar"
                animate={
                  active && !reduceMotion
                    ? { scale: [1, 1.05, 1] }
                    : { scale: 1 }
                }
                transition={
                  active && !reduceMotion
                    ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                    : undefined
                }
              >
                <Icon size={18} aria-hidden />
                <span className="sr-only">{short}</span>
              </motion.span>
              <strong>{name}</strong>
              <small>{active ? "正在接棒" : visited ? "已参与" : "等待"}</small>
            </div>
          );
        })}
      </div>

      <div className="relay-detail" aria-live="polite" data-testid="relay-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${run}-${stageIndex}`}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 10, filter: "blur(5px)" }
            }
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -8, filter: "blur(4px)" }
            }
            transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: EASE_OUT }}
          >
            <div className="relay-detail__meta">
              <span>{String(stageIndex + 1).padStart(2, "0")}</span>
              <span>{stage.role}</span>
              <span>{stage.eyebrow}</span>
            </div>
            <strong>{stage.title}</strong>
            <p>{stage.detail}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <ol className="relay-history" aria-label="已发生的接力步骤">
        {RELAY_STAGES.map((relayStage, index) => (
          <li
            key={`${relayStage.role}-${relayStage.eyebrow}`}
            className={[
              index < stageIndex ? "is-complete" : "",
              index === stageIndex ? "is-current" : ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span>
              {index < stageIndex ? (
                <Check size={10} aria-hidden />
              ) : (
                String(index + 1).padStart(2, "0")
              )}
            </span>
            <small>{relayStage.eyebrow}</small>
          </li>
        ))}
      </ol>

      <div className="relay-caption">
        <Bot size={14} />
        动画不会拦住你；看懂以后可以随时继续。
      </div>
    </div>
  );
}

function ReadyStep({ teamName }: { teamName: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="ready-state">
      <motion.div
        className="ready-orbit"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.76 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0.12 } : SPRING_LAYOUT}
      >
        <motion.svg viewBox="0 0 120 120" aria-hidden>
          <circle className="ready-orbit__track" cx="60" cy="60" r="53" />
          <motion.circle
            className="ready-orbit__progress"
            cx="60"
            cy="60"
            r="53"
            initial={{ pathLength: 0, rotate: -90 }}
            animate={{ pathLength: 1, rotate: -90 }}
            transition={{
              duration: reduceMotion ? 0 : 0.72,
              ease: EASE_OUT,
              delay: reduceMotion ? 0 : 0.08
            }}
          />
        </motion.svg>
        <motion.span
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.72 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...SPRING_LAYOUT, delay: reduceMotion ? 0 : 0.25 }}
        >
          <Check size={34} />
        </motion.span>
      </motion.div>

      <div className="ready-team">
        <span className="ready-team__avatar">M</span>
        <span>
          <small>已选团队</small>
          <strong>{teamName}</strong>
        </span>
      </div>
      <p>下一步会进入新对话，你只需要选择项目并描述目标。</p>
    </div>
  );
}

interface ConversationDestinationProps {
  teamName: string;
  titleRef: React.RefObject<HTMLHeadingElement>;
  onRestart: () => void;
}

function ConversationDestination({
  teamName,
  titleRef,
  onRestart
}: ConversationDestinationProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.main
      className="conversation-shell"
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.985, filter: "blur(8px)" }
      }
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.4, ease: EASE_OUT }}
      data-testid="conversation-destination"
    >
      <PrototypeChrome />

      <div className="conversation-layout">
        <aside className="conversation-sidebar">
          <div className="sidebar-action is-active">
            <MessageSquarePlus size={16} />
            <span>新对话</span>
          </div>
          <div className="sidebar-action">
            <Users size={16} />
            <span>Agent 团队</span>
          </div>
          <div className="sidebar-section">
            <span>项目</span>
            <small>还没有项目</small>
          </div>
          <button type="button" className="restart-link" onClick={onRestart}>
            重新查看引导
          </button>
        </aside>

        <section className="conversation-main">
          <div className="conversation-heading">
            <span className="complete-pill">
              <Check size={13} />
              引导完成
            </span>
            <h1 ref={titleRef} tabIndex={-1}>
              新对话
            </h1>
            <p>描述你的目标，团队会从这里开始推进。</p>
          </div>

          <div className="conversation-composer">
            <div className="composer-context">
              <button type="button" className="context-chip context-chip--empty">
                <FolderPlus size={14} />
                选择项目
                <ChevronDown size={13} />
              </button>
              <button
                type="button"
                className="context-chip"
                data-testid="selected-team"
              >
                <Users size={14} />
                {teamName}
                <ChevronDown size={13} />
              </button>
            </div>
            <div className="composer-input">
              <span>描述你的目标…</span>
              <button type="button" aria-label="发送" disabled>
                <Send size={16} />
              </button>
            </div>
            <p>选择一个项目后才能发送</p>
          </div>
        </section>

        <aside className="conversation-inspector">
          <span>开始前</span>
          <div>
            <strong>{teamName}</strong>
            <p>开发经理会先理解目标，再决定由谁接棒。</p>
          </div>
          <div className="inspector-member-row">
            {NODE_META.map(({ name, short }) => (
              <span key={name} title={name}>
                {short}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </motion.main>
  );
}

interface ReviewControlsProps {
  open: boolean;
  theme: "dark" | "light";
  onToggleOpen: () => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onScenarioChange: (environment: EnvironmentState) => void;
}

function ReviewControls({
  open,
  theme,
  onToggleOpen,
  onThemeChange,
  onScenarioChange
}: ReviewControlsProps) {
  return (
    <div className="review-controls">
      <AnimatePresence>
        {open ? (
          <motion.div
            className="review-panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={SPRING_LAYOUT}
            role="dialog"
            aria-label="原型评审场景"
          >
            <div className="review-panel__head">
              <strong>原型场景</strong>
              <span>不属于产品界面</span>
            </div>
            <div className="review-panel__row">
              <button type="button" onClick={() => onScenarioChange("ready")}>
                正常路径
              </button>
              <button type="button" onClick={() => onScenarioChange("missing")}>
                缺少 codex
              </button>
            </div>
            <div className="review-panel__row">
              <button
                type="button"
                onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                切换为{theme === "dark" ? "亮色" : "暗色"}
              </button>
            </div>
            <p>减少动态效果请使用系统辅助功能设置。</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        className="review-trigger"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="打开原型评审场景"
      >
        <SlidersHorizontal size={15} />
        <span>原型场景</span>
      </button>
    </div>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing onboarding prototype root.");
}

createRoot(root).render(<App />);
