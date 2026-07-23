import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  CornerUpLeft,
  FolderPlus,
  Info,
  MessageSquarePlus,
  Moon,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
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
  type CSSProperties,
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
  SPRING_LAYOUT,
  SPRING_PRESS
} from "./beui-button.js";
import { LoaderDots } from "./beui-loader.js";
import {
  canContinue,
  initialOnboardingState,
  onboardingReducer,
  type EnvironmentState,
  type OnboardingStep
} from "./onboarding-state.js";
import "./tokens.css";
import "./styles.css";

/*
 * 第 3 步接力故事线（PRD 固定 6 拍，参照真实本地会话案例口吻）：
 * 经理拆解派工 → 开发执行 → 测试打回 → 开发修正 → 测试复核通过 → 经理带证据收尾。
 * member 索引对应 MEMBERS：0 开发经理 / 1 开发 / 2 测试。
 */
const MEMBERS = [
  { name: "开发经理", initial: "经", duty: "主 Agent" },
  { name: "开发", initial: "开", duty: "实现" },
  { name: "测试", initial: "测", duty: "复核" }
] as const;

type PillTone = "success" | "amber" | "danger" | "info" | "neutral";

interface RelayBeat {
  member: number;
  tag: string;
  body: string;
  pill?: { tone: PillTone; label: string };
  handoff?: { kind: "交棒" | "打回"; to: number };
}

const RELAY_BEATS: RelayBeat[] = [
  {
    member: 0,
    tag: "拆解派工",
    body: "运行时长统计对不上？这单我接了。先查是断线时间被持续累计，还是并行会话重复计时，确认根因再动手。",
    handoff: { kind: "交棒", to: 1 }
  },
  {
    member: 1,
    tag: "排查修复",
    body: "确认了，是缺陷：断线后的时间被持续累计。我按 180 秒心跳断档重新切段，改完跑全量测试。",
    handoff: { kind: "交棒", to: 2 }
  },
  {
    member: 2,
    tag: "独立复核",
    pill: { tone: "danger", label: "复核不通过" },
    body: "复核不通过：pending 心跳的断档还有两处一致性缺陷，直接收尾会留坑。",
    handoff: { kind: "打回", to: 1 }
  },
  {
    member: 1,
    tag: "修正",
    body: "收到。断档边界补齐：pending 心跳先固化再开新段，新增的回归测试全部通过。",
    handoff: { kind: "交棒", to: 2 }
  },
  {
    member: 2,
    tag: "再次复核",
    pill: { tone: "success", label: "复核通过" },
    body: "复核通过：边界用例都盖住了，379 项测试全绿。证据留在上面，可以收尾。",
    handoff: { kind: "交棒", to: 0 }
  },
  {
    member: 0,
    tag: "带证据收尾",
    pill: { tone: "success", label: "已收尾" },
    body: "收尾：时长口径已修复，测试复核两轮、第二轮通过。过程和证据都在上面，这个目标完成。"
  }
];

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

  const returnToPreviousStep = useCallback(() => {
    dispatch({ type: "back" });
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
            key="onboarding"
            step={state.view}
            titleRef={titleRef}
            title={stepTitle(state.view)}
            subtitle={stepSubtitle(state.view)}
            wide={state.view === 3}
            primaryLabel={state.view === 4 ? "开始使用" : "继续"}
            primaryDisabled={!canContinue(state)}
            onPrimary={continueJourney}
            secondary={
              state.view > 1 ? (
                <PrototypeButton
                  variant="secondary"
                  onClick={returnToPreviousStep}
                  data-testid="back-action"
                >
                  <ArrowLeft size={14} />
                  上一步
                </PrototypeButton>
              ) : state.environment !== "ready" ? (
                <PrototypeButton
                  variant="secondary"
                  onClick={recheck}
                  disabled={state.environment === "checking"}
                  data-testid="recheck"
                >
                  <RefreshCw
                    size={14}
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
            {state.view === 4 ? <ReadyStep /> : null}
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
      return "看看团队如何完成一次接力";
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
      return "每一次交接都会留下过程、结论和复核证据";
    case 4:
      return "团队已经就位，说出你的目标就能开工";
  }
}

function Pill({
  tone,
  children
}: {
  tone: PillTone;
  children: ReactNode;
}) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

interface OnboardingShellProps {
  step: OnboardingStep;
  title: string;
  subtitle: string;
  titleRef: React.RefObject<HTMLHeadingElement>;
  wide: boolean;
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
  wide,
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
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.3, ease: EASE_OUT }}
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
            首次启动 · 第 {step} 步，共 4 步
          </motion.div>
          <h1 ref={titleRef} tabIndex={-1}>
            {title}
          </h1>
          <p>{subtitle}</p>
        </div>

        <div className={wide ? "stage-content stage-content--wide" : "stage-content"}>
          {children}
        </div>
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

/* ---------- 第 1 步 · 环境 ---------- */

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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_LAYOUT, delay: 0.05 }}
      >
        <StatusRow
          icon={<Check size={15} />}
          label="codex 已安装"
          meta="已在本机找到命令"
        />
        <StatusRow
          icon={<Check size={15} />}
          label="codex 可以运行"
          meta="团队成员已经可以开始工作"
        />
        <div className="ready-note">
          <Info size={13} />
          只检查运行团队所需的 codex，不检查其他工具。
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="environment-card environment-card--error"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_LAYOUT}
    >
      <div className="missing-head">
        <span className="status-icon status-icon--danger">
          <X size={15} />
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
          {copied ? <Check size={13} /> : <Copy size={13} />}
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
      <Pill tone="success">通过</Pill>
    </div>
  );
}

/* ---------- 第 2 步 · 团队 ---------- */

function TeamStep({ teamName }: { teamName: string }) {
  return (
    <div className="team-list">
      <motion.button
        type="button"
        className="team-card is-selected"
        aria-pressed="true"
        initial={{ opacity: 0, y: 12 }}
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
          <Pill tone="neutral">
            <Check size={12} />
            已选择
          </Pill>
        </div>

        <div className="team-members">
          {MEMBERS.map(({ name, initial, duty }) => (
            <div className="member-chip" key={name}>
              <span className="member-avatar" aria-hidden>
                {initial}
              </span>
              <span>
                <strong>{name}</strong>
                <small>{duty}</small>
              </span>
            </div>
          ))}
        </div>

        <p>适合方案、实现、审查和验收类任务。</p>
      </motion.button>

      <motion.button
        type="button"
        className="create-team-card is-pending"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_LAYOUT, delay: 0.09 }}
        disabled
        aria-describedby="create-team-prototype-note"
      >
        <span className="create-team-icon">
          <MessageSquarePlus size={16} />
        </span>
        <span>
          <strong>跟 AI 聊出一支新团队</strong>
          <small>说一下想做什么，AI 帮你把成员组齐</small>
        </span>
        <Pill tone="neutral">流程待讨论</Pill>
      </motion.button>
      <span id="create-team-prototype-note" className="sr-only">
        此入口的后续流程仍待产品讨论，本原型只确认入口位置。
      </span>
    </div>
  );
}

/* ---------- 第 3 步 · 团队接力（迷你会话时间线） ---------- */

/*
 * 节拍编排：每个 beat 先出现「正在输入」气泡（beUI Loader dots 适配版），
 * 角色表头的接力棒下划线用 beUI shared-layout（layoutId）技法提前滑到
 * 即将发言的成员列，随后消息弹入、相邻节点间的 S 形连接线描画到位。
 * 减少动态效果：跳过打字气泡与描画，逐条淡入，信息等价。
 */
const BEAT_FIRST_MS = 420;
const BEAT_STEP_MS = 1700;
const BEAT_TYPING_MS = 640;

function RelayStep({ run, onReplay }: { run: number; onReplay: () => void }) {
  const reduceMotion = useReducedMotion();
  const [beatIndex, setBeatIndex] = useState(-1);
  const [typingIndex, setTypingIndex] = useState(-1);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timers = RELAY_BEATS.flatMap((_, index) => {
      if (reduceMotion) {
        return [
          window.setTimeout(() => setBeatIndex(index), 250 + index * 900)
        ];
      }
      const start = BEAT_FIRST_MS + index * BEAT_STEP_MS;
      return [
        window.setTimeout(() => setTypingIndex(index), start),
        window.setTimeout(() => {
          setTypingIndex(-1);
          setBeatIndex(index);
        }, start + BEAT_TYPING_MS)
      ];
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduceMotion, run]);

  useEffect(() => {
    const current = timelineRef.current?.querySelector(".relay-msg.is-current");
    current?.scrollIntoView({
      block: "end",
      behavior: reduceMotion ? "auto" : "smooth"
    });
  }, [beatIndex, reduceMotion]);

  const holder =
    typingIndex >= 0
      ? RELAY_BEATS[typingIndex].member
      : beatIndex >= 0
        ? RELAY_BEATS[beatIndex].member
        : -1;

  return (
    <div className="relay-card">
      <div className="relay-topline">
        <div>
          <span className="live-indicator">
            <span />
            接力演示
          </span>
          <strong>开发团队</strong>
        </div>
        <button
          type="button"
          className="replay-action"
          onClick={onReplay}
          data-testid="replay-relay"
        >
          <RotateCcw size={13} />
          重新播放
        </button>
      </div>

      <div className="relay-grid-heading">
        <div className="relay-role-columns" aria-label="接力角色位置">
          {MEMBERS.map(({ name, initial }, index) => (
            <span className={index === holder ? "is-holder" : ""} key={name}>
              <b aria-hidden>{initial}</b>
              <small>{name}</small>
              {index === holder ? (
                reduceMotion ? (
                  <i className="relay-holder-glide" aria-hidden />
                ) : (
                  /*
                   * 接力棒下划线：layoutId 共享布局滑行，
                   * 技法改编自 beUI shared-layout-bg
                   * https://beui.dev/components/motion/shared-layout-bg
                   */
                  <motion.i
                    className="relay-holder-glide"
                    layoutId="relay-holder-glide"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={SPRING_LAYOUT}
                    aria-hidden
                  />
                )
              ) : null}
            </span>
          ))}
        </div>
        <span>对话记录</span>
      </div>

      <div className="relay-timeline" ref={timelineRef}>
        <div className="relay-goal-row">
          <span className="relay-goal-label">你的目标</span>
          <div className="relay-msg__body">
            <div className="relay-msg__head">
              <strong>你</strong>
              <small>目标</small>
            </div>
            <p className="relay-msg__text">
              排查一下：运行时长统计好像不太对。
            </p>
          </div>
        </div>

        <ol
          className="relay-history"
          aria-label="接力记录"
          aria-live="polite"
          data-testid="relay-stage"
        >
          {/*
           * popLayout：退出中的「正在输入」气泡立即脱离布局流，
           * 不与新消息同时占位，避免高度先撑开再塌回的闪烁。
           */}
          <AnimatePresence initial={false} mode="popLayout">
            {RELAY_BEATS.slice(0, beatIndex + 1).map((beat, index) => {
              const member = MEMBERS[beat.member];
              const previousMember =
                index > 0 ? RELAY_BEATS[index - 1].member : null;
              const isCurrent = index === beatIndex;
              const isComplete = index < beatIndex;
              const isLast = index === RELAY_BEATS.length - 1;
              const graphStyle = {
                "--role-index": beat.member
              } as CSSProperties;
              const nodeX = (beat.member + 0.5) * 100;
              const previousX =
                previousMember === null ? nodeX : (previousMember + 0.5) * 100;
              return (
                <motion.li
                  className={[
                    "relay-msg",
                    isCurrent ? "is-current" : "",
                    isComplete ? "is-complete" : "",
                    isCurrent && isLast ? "is-last" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={`${run}-${index}`}
                  data-member={member.name}
                  data-testid="relay-beat"
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 12, filter: "blur(4px)" }
                  }
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={
                    reduceMotion
                      ? { duration: 0.12 }
                      : { ...SPRING_LAYOUT, filter: { duration: 0.3 } }
                  }
                >
                  <div
                    className="relay-graph-cell"
                    style={graphStyle}
                    aria-label={
                      previousMember === null
                        ? `${member.name}开始处理`
                        : `${MEMBERS[previousMember].name}交给${member.name}`
                    }
                  >
                    {previousMember !== null ? (
                      <svg
                        className="relay-graph-svg"
                        viewBox="0 0 300 31"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <motion.path
                          className="relay-graph-connector"
                          d={`M ${previousX} 0 C ${previousX} 20 ${nodeX} 11 ${nodeX} 31`}
                          initial={reduceMotion ? false : { pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={
                            reduceMotion
                              ? { duration: 0.12 }
                              : { duration: 0.5, ease: EASE_OUT, delay: 0.1 }
                          }
                        />
                      </svg>
                    ) : null}
                    <motion.span
                      className={[
                        "relay-graph-node",
                        isCurrent ? "is-current" : "",
                        isComplete ? "is-complete" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      initial={
                        reduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.3 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      transition={
                        reduceMotion
                          ? { duration: 0.12 }
                          : { ...SPRING_PRESS, delay: 0.32 }
                      }
                      aria-hidden
                    />
                    {index < beatIndex ? (
                      <span className="relay-graph-tail" aria-hidden />
                    ) : null}
                  </div>
                  <div className="relay-msg__body">
                    <div className="relay-msg__head">
                      <strong>{member.name}</strong>
                      <small>{beat.tag}</small>
                      {beat.pill ? (
                        <Pill tone={beat.pill.tone}>{beat.pill.label}</Pill>
                      ) : null}
                    </div>
                    <p className="relay-msg__text">{beat.body}</p>
                    {beat.handoff ? (
                      <div className="relay-msg__foot">
                        <span
                          className={[
                            "relay-handoff",
                            beat.handoff.kind === "打回"
                              ? "relay-handoff--back"
                              : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {beat.handoff.kind === "打回" ? (
                            <CornerUpLeft size={11} aria-hidden />
                          ) : (
                            <ArrowRight size={11} aria-hidden />
                          )}
                          {beat.handoff.kind}{" "}
                          <b>@{MEMBERS[beat.handoff.to].name}</b>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </motion.li>
              );
            })}
            {typingIndex >= 0 && typingIndex > beatIndex ? (
              <motion.li
                className="relay-typing"
                key={`typing-${run}-${typingIndex}`}
                initial={
                  reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                transition={
                  reduceMotion ? { duration: 0.12 } : SPRING_LAYOUT
                }
                aria-hidden
              >
                <div className="relay-graph-cell" />
                <div className="relay-typing__bubble">
                  <span className="relay-typing__avatar">
                    {MEMBERS[RELAY_BEATS[typingIndex].member].initial}
                  </span>
                  <LoaderDots size={14} />
                </div>
              </motion.li>
            ) : null}
          </AnimatePresence>
        </ol>
      </div>

      <div className="relay-caption">
        <Users size={12} />
        动画不会拦住你；看懂以后可以随时继续。
      </div>
    </div>
  );
}

/* ---------- 第 4 步 · 准备就绪 ---------- */

function ReadyStep() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="ready-state">
      <motion.div
        className="ready-mark"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0.12 } : SPRING_LAYOUT}
      >
        <Check size={38} />
      </motion.div>
    </div>
  );
}

/* ---------- 去向：新建对话 ---------- */

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
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.32, ease: EASE_OUT }}
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
            <Pill tone="success">
              <Check size={12} />
              引导完成
            </Pill>
            <h1 ref={titleRef} tabIndex={-1}>
              新对话
            </h1>
            <p>描述你的目标，团队会从这里开始推进。</p>
          </div>

          <div className="conversation-composer">
            <div className="composer-context">
              <button type="button" className="context-chip context-chip--empty">
                <FolderPlus size={13} />
                选择项目
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                className="context-chip"
                data-testid="selected-team"
              >
                <Users size={13} />
                {teamName}
                <ChevronDown size={12} />
              </button>
            </div>
            <div className="composer-input">
              <span>描述你的目标…</span>
              <button type="button" aria-label="发送" disabled>
                <Send size={15} />
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
            {MEMBERS.map(({ name, initial }) => (
              <span key={name} title={name}>
                {initial}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </motion.main>
  );
}

/* ---------- 原型评审浮动控制（不属于产品界面） ---------- */

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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
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
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
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
        <SlidersHorizontal size={14} />
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
