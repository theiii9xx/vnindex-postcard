import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Composition,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/BeVietnamPro";
import { VNIndexBar } from "./fetchVNIndex";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "700", "800"],
  subsets: ["latin", "vietnamese"],
});

const WIDTH = 1080;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_IN_FRAMES = 8 * FPS;

type Props = {
  bars: VNIndexBar[];
};

const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  abortSignal,
}) => {
  // Data is pre-fetched into public/vnindex.json by `npm run fetch-data`
  // (see scripts/fetch-vnindex.mjs) — VNDirect's bot-protection blocks requests
  // made directly from the headless render browser, so we can't fetch it here.
  const response = await fetch(staticFile("vnindex.json"), { signal: abortSignal });

  if (!response.ok) {
    throw new Error(
      `Could not read public/vnindex.json (${response.status}). Run "npm run fetch-data" first.`,
    );
  }

  const bars = (await response.json()) as VNIndexBar[];

  return {
    props: { bars },
  };
};

export const VNIndexPostcardComposition = () => {
  return (
    <Composition
      id="VNIndexPostcard"
      component={VNIndexPostcard}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ bars: [] as VNIndexBar[] }}
      calculateMetadata={calculateMetadata}
    />
  );
};

const formatPoints = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} triệu CP`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)} nghìn CP`;
  return `${v} CP`;
};

const formatDate = (unixSeconds: number) => {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const VNIndexPostcard: React.FC<Props> = ({ bars }) => {
  const frame = useCurrentFrame();

  if (!bars || bars.length < 2) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0b1220",
          color: "white",
          fontFamily,
          fontSize: 44,
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          padding: 80,
        }}
      >
        Không tải được dữ liệu VN-Index
      </AbsoluteFill>
    );
  }

  const latest = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  const change = latest.close - previous.close;
  const changePercent = (change / previous.close) * 100;
  const isUp = change > 0;
  const isFlat = Math.abs(change) < 0.005;

  // VN market convention: up = red, down = green, flat = yellow.
  const accentColor = isFlat ? "#eab308" : isUp ? "#ef4444" : "#22c55e";
  const accentColorSoft = isFlat
    ? "rgba(234,179,8,0.15)"
    : isUp
      ? "rgba(239,68,68,0.15)"
      : "rgba(34,197,94,0.15)";

  // --- Animations ---
  const cardIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const headerIn = interpolate(frame, [8, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const numberProgress = interpolate(frame, [16, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const displayedClose = previous.close + (latest.close - previous.close) * numberProgress;

  const badgeIn = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const chartIn = interpolate(frame, [55, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const footerIn = interpolate(frame, [110, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // --- Chart geometry ---
  const chartWidth = WIDTH - 160;
  const chartHeight = 300;
  const closes = bars.map((b) => b.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const range = maxClose - minClose || 1;

  const points = bars.map((b, i) => {
    const x = (i / (bars.length - 1)) * chartWidth;
    const y = chartHeight - ((b.close - minClose) / range) * chartHeight;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const areaPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

  return (
    <AbsoluteFill
      style={{
        fontFamily,
        background: "linear-gradient(160deg, #0b1220 0%, #111c33 55%, #0b1220 100%)",
      }}
    >
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Interactive.Div
          name="Card"
          style={{
            width: WIDTH - 96,
            height: HEIGHT - 96,
            borderRadius: 40,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
            scale: interpolate(cardIn, [0, 1], [0.94, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
            opacity: cardIn,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "72px 64px 56px",
          }}
        >
          {/* Header */}
          <Interactive.Div
            name="Header"
            style={{
              opacity: headerIn,
              translate: `0px ${interpolate(headerIn, [0, 1], [12, 0])}px`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 30,
                letterSpacing: 6,
                fontWeight: 700,
                color: "rgba(255,255,255,0.55)",
              }}
            >
              VN-INDEX · HOSE
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 400,
                color: "rgba(255,255,255,0.4)",
                textTransform: "capitalize",
              }}
            >
              {formatDate(latest.time)}
            </div>
          </Interactive.Div>

          {/* Big number */}
          <Interactive.Div
            name="BigNumber"
            style={{
              marginTop: 44,
              fontSize: 168,
              fontWeight: 800,
              color: "white",
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            {formatPoints(displayedClose)}
          </Interactive.Div>

          {/* Change badge */}
          <Interactive.Div
            name="ChangeBadge"
            style={{
              marginTop: 28,
              opacity: badgeIn,
              scale: interpolate(badgeIn, [0, 1], [0.9, 1], {
                easing: Easing.spring({ damping: 200 }),
                output: "perceptual-scale",
              }),
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 32px",
              borderRadius: 999,
              background: accentColorSoft,
              border: `1px solid ${accentColor}55`,
            }}
          >
            <div style={{ fontSize: 48, fontWeight: 700, color: accentColor }}>
              {isFlat ? "◆" : isUp ? "▲" : "▼"}
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, color: accentColor }}>
              {isUp ? "+" : ""}
              {formatPoints(change)} ({isUp ? "+" : ""}
              {changePercent.toFixed(2)}%)
            </div>
          </Interactive.Div>

          {/* Chart */}
          <Interactive.Div
            name="Chart"
            style={{
              marginTop: 56,
              width: chartWidth,
              opacity: interpolate(chartIn, [0, 0.3], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <svg
              width={chartWidth}
              height={chartHeight}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#areaFill)" opacity={chartIn} />
              <path
                d={linePath}
                fill="none"
                stroke={accentColor}
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={interpolate(chartIn, [0, 1], [1, 0])}
              />
            </svg>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                fontSize: 26,
                color: "rgba(255,255,255,0.45)",
              }}
            >
              <span>{formatDate(bars[0].time).split(",")[0]}</span>
              <span>30 phiên gần nhất</span>
              <span>{formatDate(latest.time).split(",")[0]}</span>
            </div>
          </Interactive.Div>

          {/* Footer */}
          <Interactive.Div
            name="Footer"
            style={{
              marginTop: "auto",
              opacity: footerIn,
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 32,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              fontSize: 28,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <span>KLGD: {formatVolume(latest.volume)}</span>
            <span>Nguồn: VNDirect</span>
          </Interactive.Div>
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
