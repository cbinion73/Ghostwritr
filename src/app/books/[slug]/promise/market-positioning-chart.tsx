"use client";

interface CompetitorPosition {
  title: string;
  author: string;
  x: number; // 0-100, Academic (0) to Practical (100)
  y: number; // 0-100, Niche (0) to Broad (100)
}

interface MarketPositioningChartProps {
  yourBook: {
    title: string;
    x: number;
    y: number;
  };
  competitors: CompetitorPosition[];
}

export function MarketPositioningChart({
  yourBook,
  competitors,
}: MarketPositioningChartProps) {
  const chartWidth = 500;
  const chartHeight = 400;
  const padding = 60;
  const plotWidth = chartWidth - 2 * padding;
  const plotHeight = chartHeight - 2 * padding;

  // Convert percentage values to pixel coordinates
  const xToPixel = (x: number) => padding + (x / 100) * plotWidth;
  const yToPixel = (y: number) => chartHeight - padding - (y / 100) * plotHeight;

  return (
    <div style={styles.container}>
      <div style={styles.chartWrapper}>
        <svg width={chartWidth} height={chartHeight} style={styles.svg}>
          {/* Grid */}
          <g style={{ opacity: 0.1 }}>
            {[0, 25, 50, 75, 100].map((val) => (
              <line
                key={`v-${val}`}
                x1={xToPixel(val)}
                y1={padding}
                x2={xToPixel(val)}
                y2={chartHeight - padding}
                stroke="#000"
                strokeWidth="1"
                strokeDasharray="4"
              />
            ))}
            {[0, 25, 50, 75, 100].map((val) => (
              <line
                key={`h-${val}`}
                x1={padding}
                y1={yToPixel(val)}
                x2={chartWidth - padding}
                y2={yToPixel(val)}
                stroke="#000"
                strokeWidth="1"
                strokeDasharray="4"
              />
            ))}
          </g>

          {/* Center cross lines */}
          <line
            x1={padding}
            y1={yToPixel(50)}
            x2={chartWidth - padding}
            y2={yToPixel(50)}
            stroke="#d1d5db"
            strokeWidth="2"
          />
          <line
            x1={xToPixel(50)}
            y1={padding}
            x2={xToPixel(50)}
            y2={chartHeight - padding}
            stroke="#d1d5db"
            strokeWidth="2"
          />

          {/* Axes */}
          <line
            x1={padding}
            y1={chartHeight - padding}
            x2={chartWidth - padding}
            y2={chartHeight - padding}
            stroke="#000"
            strokeWidth="2"
          />
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={chartHeight - padding}
            stroke="#000"
            strokeWidth="2"
          />

          {/* Axis labels background boxes (for readability) */}
          <rect x={0} y={chartHeight - 40} width={padding} height={40} fill="#fefbf5" />
          <rect x={chartWidth - padding} y={chartHeight - 40} width={padding} height={40} fill="#fefbf5" />

          {/* Axis labels */}
          <text
            x={padding - 10}
            y={chartHeight - 10}
            fontSize="12"
            fontWeight="600"
            textAnchor="end"
            fill="#2d241d"
          >
            Academic
          </text>
          <text
            x={chartWidth - padding + 10}
            y={chartHeight - 10}
            fontSize="12"
            fontWeight="600"
            textAnchor="start"
            fill="#2d241d"
          >
            Practical
          </text>

          <text
            x={padding + 10}
            y={20}
            fontSize="12"
            fontWeight="600"
            textAnchor="start"
            fill="#2d241d"
          >
            Broad Market
          </text>
          <text
            x={padding + 10}
            y={chartHeight - padding - 10}
            fontSize="12"
            fontWeight="600"
            textAnchor="start"
            fill="#2d241d"
          >
            Niche
          </text>

          {/* Quadrant labels */}
          <text
            x={padding + 40}
            y={padding + 40}
            fontSize="11"
            fontStyle="italic"
            fill="#9ca3af"
          >
            Academic + Niche
          </text>
          <text
            x={chartWidth - padding - 120}
            y={padding + 40}
            fontSize="11"
            fontStyle="italic"
            fill="#9ca3af"
          >
            Practical + Niche
          </text>
          <text
            x={padding + 40}
            y={chartHeight - padding - 10}
            fontSize="11"
            fontStyle="italic"
            fill="#9ca3af"
          >
            Academic + Broad
          </text>
          <text
            x={chartWidth - padding - 120}
            y={chartHeight - padding - 10}
            fontSize="11"
            fontStyle="italic"
            fill="#9ca3af"
          >
            Practical + Broad
          </text>

          {/* Competitor dots */}
          {competitors.map((comp, idx) => (
            <g key={idx}>
              <circle
                cx={xToPixel(comp.x)}
                cy={yToPixel(comp.y)}
                r="5"
                fill="#ea580c"
                opacity="0.7"
              />
              <circle
                cx={xToPixel(comp.x)}
                cy={yToPixel(comp.y)}
                r="8"
                fill="none"
                stroke="#ea580c"
                strokeWidth="1"
                opacity="0.4"
              />
            </g>
          ))}

          {/* Your book star */}
          <g>
            <path
              d={`M ${xToPixel(yourBook.x)} ${yToPixel(yourBook.y) - 12} L ${xToPixel(yourBook.x) + 4} ${yToPixel(yourBook.y) - 4} L ${xToPixel(yourBook.x) + 12} ${yToPixel(yourBook.y) - 1} L ${xToPixel(yourBook.x) + 6} ${yToPixel(yourBook.y) + 5} L ${xToPixel(yourBook.x) + 8} ${yToPixel(yourBook.y) + 14} L ${xToPixel(yourBook.x)} ${yToPixel(yourBook.y) + 9} L ${xToPixel(yourBook.x) - 8} ${yToPixel(yourBook.y) + 14} L ${xToPixel(yourBook.x) - 6} ${yToPixel(yourBook.y) + 5} L ${xToPixel(yourBook.x) - 12} ${yToPixel(yourBook.y) - 1} L ${xToPixel(yourBook.x) - 4} ${yToPixel(yourBook.y) - 4} Z`}
              fill="#16a34a"
              stroke="#15803d"
              strokeWidth="2"
            />
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={styles.yourBookLegend}>★</div>
          <span>Your Book</span>
        </div>
        <div style={styles.legendItem}>
          <div style={styles.competitorLegend}>●</div>
          <span>Competitors</span>
        </div>
      </div>

      {/* Competitor list */}
      {competitors.length > 0 && (
        <div style={styles.competitorsList}>
          <h4 style={styles.competitorsTitle}>Competitive Landscape</h4>
          <div style={styles.competitorsGrid}>
            {competitors.map((comp, idx) => (
              <div key={idx} style={styles.competitorCard}>
                <div style={styles.competitorNumber}>{idx + 1}</div>
                <div>
                  <p style={styles.competitorTitle}>{comp.title}</p>
                  <p style={styles.competitorAuthor}>by {comp.author}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "24px",
  },
  chartWrapper: {
    display: "flex" as const,
    justifyContent: "center" as const,
    padding: "20px",
    backgroundColor: "rgba(45, 36, 29, 0.02)",
    borderRadius: "12px",
    border: "1px solid rgba(45, 36, 29, 0.1)",
  },
  svg: {
    backgroundColor: "white",
    borderRadius: "8px",
  },
  legend: {
    display: "flex" as const,
    gap: "24px",
    justifyContent: "center" as const,
    padding: "16px",
    backgroundColor: "rgba(45, 36, 29, 0.03)",
    borderRadius: "8px",
  },
  legendItem: {
    display: "flex" as const,
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 500,
    color: "#2d241d",
  },
  yourBookLegend: {
    fontSize: "20px",
    color: "#16a34a",
  },
  competitorLegend: {
    fontSize: "16px",
    color: "#ea580c",
  },
  competitorsList: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "12px",
  },
  competitorsTitle: {
    margin: "0 0 12px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#2d241d",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  competitorsGrid: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "12px",
  },
  competitorCard: {
    display: "flex" as const,
    gap: "12px",
    padding: "12px",
    backgroundColor: "#fbf6ef",
    border: "1px solid rgba(45, 36, 29, 0.1)",
    borderRadius: "8px",
  },
  competitorNumber: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#ea580c",
    minWidth: "24px",
  },
  competitorTitle: {
    margin: "0 0 2px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#2d241d",
  },
  competitorAuthor: {
    margin: 0,
    fontSize: "11px",
    color: "#6f6256",
  },
};
