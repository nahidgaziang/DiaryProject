import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Trash2, PlusCircle, Check, X, PenTool, Cloud, Sun, CloudRain, Snowflake, Moon, MapPin, Search, ChevronLeft, ChevronRight, RefreshCw, Pencil, Bold, Italic, Code2, Heading1, Heading2, Quote, List, Menu, Settings, ListOrdered, Activity, TrendingUp, BarChart2, Tag, Download, Upload } from 'lucide-react';
import type { DiaryEntry, MoodType, WeatherType } from './types';
import { DiaryStorageService } from './utils/storage';
import { detectLocation, fetchWeather } from './utils/weather';
import { renderMarkdown, stripMarkdown } from './utils/markdown';
import JSZip from 'jszip';


interface DraftData {
  title: string;
  content: string;
  mood: MoodType;
  weather: WeatherType;
  temperature: string;
  location: string;
  tags: string[];
  cardColor?: string;
  customColorInput: string;
  isEditMode: boolean;
  editingEntryId: string | null;
  targetDateString: string;
  savedAt: string;
}


const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const WEATHER_ICONS: Record<WeatherType, { icon: React.ReactNode; label: string; emoji: string }> = {
  sunny: { icon: <Sun size={16} />, label: 'Sunny', emoji: '☀️' },
  cloudy: { icon: <Cloud size={16} />, label: 'Cloudy', emoji: '☁️' },
  rainy: { icon: <CloudRain size={16} />, label: 'Rainy', emoji: '🌧️' },
  snowy: { icon: <Snowflake size={16} />, label: 'Snowy', emoji: '❄️' },
  clear: { icon: <Moon size={16} />, label: 'Clear', emoji: '🌌' }
};

const MOODS: { type: MoodType; label: string; icon: string; color: string }[] = [
  { type: 'joyful',     label: 'Joyful',     icon: '☀️', color: '#FAB514' },   /* Maroona */
  { type: 'calm',       label: 'Calm',       icon: '🍃', color: '#76C2F0' },   /* Mendung Parah */
  { type: 'reflective', label: 'Reflective', icon: '🌊', color: '#1A92B4' },   /* Blue Kadestin */
  { type: 'tired',      label: 'Tired',      icon: '💤', color: '#9EB2C5' },   /* Old Leaf tint */
  { type: 'anxious',    label: 'Anxious',    icon: '☁️', color: '#FC7C00' }    /* Mendung */
];

// Sub-themes: solid Colorista accent colors
const THEMES = [
  { id: 'ocean',  name: 'Blue Kadestin', color: '#1A92B4' },
  { id: 'forest', name: 'Mendung Parah', color: '#76C2F0' },
  { id: 'amber',  name: 'Maroona',       color: '#FAB514' },
  { id: 'slate',  name: 'Mendung',       color: '#FC7C00' }
] as const;

// Per-entry accent color presets (Colorista vivid solid colors)
const CARD_COLOR_PRESETS = [
  { label: 'Blue Kadestin', hex: '#1A92B4' },
  { label: 'Mendung Parah', hex: '#76C2F0' },
  { label: 'Maroona',       hex: '#FAB514' },
  { label: 'Mendung',       hex: '#FC7C00' },
  { label: 'Old Leaf',      hex: '#0B253A' },
  { label: 'Crimson Red',   hex: '#DC2626' },
  { label: 'Coral Sunset',  hex: '#FB7185' },
  { label: 'Mint Green',    hex: '#84CC16' }
];

const TEXT_COLORS = [
  { name: 'Default',       color: 'inherit' },
  { name: 'Blue Kadestin', color: '#1A92B4' },
  { name: 'Mendung Parah', color: '#76C2F0' },
  { name: 'Maroona',       color: '#FAB514' },
  { name: 'Mendung',       color: '#FC7C00' },
  { name: 'Old Leaf',      color: '#0B253A' },
  { name: 'Crimson Red',   color: '#DC2626' }
];

/** Returns the solid accent color for an entry's accent strip. */
const getEntryAccentColor = (cardColor?: string): string => {
  if (!cardColor) return 'var(--accent)';
  return cardColor;
};

// Helper components/views for Stats tab
interface AnalyticsDashboardProps {
  entries: DiaryEntry[];
  onSelectTag: (tag: string) => void;
}

function AnalyticsDashboard({ entries, onSelectTag }: AnalyticsDashboardProps) {
  // 1. Mood counts
  const moodCounts = entries.reduce((acc, entry) => {
    acc[entry.mood] = (acc[entry.mood] || 0) + 1;
    return acc;
  }, {} as Record<MoodType, number>);

  const totalEntries = entries.length;

  // Track hovered segment in donut chart
  const [hoveredMood, setHoveredMood] = useState<MoodType | null>(null);

  // 2. Heatmap Grid
  // Compute day mapping for 53 weeks
  // Find sunday 364 days ago
  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() - 364);
  const dayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOfWeek); // Go back to Sunday

  // Generate cells
  const heatmapWeeks: string[][] = [];
  const currentDay = new Date(startDate);
  for (let w = 0; w < 53; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(getLocalDateString(currentDay));
      currentDay.setDate(currentDay.getDate() + 1);
    }
    heatmapWeeks.push(week);
  }

  // Group entries by dateString
  const entriesByDate = entries.reduce((acc, entry) => {
    acc[entry.dateString] = (acc[entry.dateString] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const [hoveredDay, setHoveredDay] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  // 3. Mood Timeline (last 30 days)
  const timelineDays: { dateStr: string; score: number; entries: DiaryEntry[] }[] = [];
  const moodScores: Record<MoodType, number> = {
    joyful: 5,
    calm: 4,
    reflective: 3,
    anxious: 2,
    tired: 1
  };

  const [hoveredTimelinePoint, setHoveredTimelinePoint] = useState<{
    dateStr: string;
    score: number;
    title: string;
    x: number;
    y: number;
  } | null>(null);

  // Populate last 30 days
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dStr = getLocalDateString(d);
    const dayEntries = entries.filter(e => e.dateString === dStr);
    if (dayEntries.length > 0) {
      const avgScore = dayEntries.reduce((sum, e) => sum + moodScores[e.mood], 0) / dayEntries.length;
      timelineDays.push({ dateStr: dStr, score: avgScore, entries: dayEntries });
    }
  }

  // Calculate SVG points for timeline
  // Width = 500, Height = 150
  const svgWidth = 500;
  const svgHeight = 150;
  const paddingX = 30;
  const paddingY = 25;

  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingY * 2;

  const timelinePoints = timelineDays.map((d, index) => {
    // X goes from 0 to chartWidth based on index if multiple, or center
    const x = timelineDays.length > 1
      ? paddingX + (index / (timelineDays.length - 1)) * chartWidth
      : svgWidth / 2;

    // Y goes from paddingY to svgHeight - paddingY based on score (1 to 5)
    // 5 maps to paddingY (top), 1 maps to svgHeight - paddingY (bottom)
    const y = paddingY + chartHeight - ((d.score - 1) / 4) * chartHeight;

    return { x, y, dateStr: d.dateStr, score: d.score, firstEntry: d.entries[0] };
  });

  // SVG Path description
  let linePath = '';
  let areaPath = '';
  if (timelinePoints.length > 1) {
    linePath = `M ${timelinePoints[0].x} ${timelinePoints[0].y} ` +
      timelinePoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');

    areaPath = `${linePath} L ${timelinePoints[timelinePoints.length - 1].x} ${svgHeight - paddingY} L ${timelinePoints[0].x} ${svgHeight - paddingY} Z`;
  }

  // 4. Tags frequency
  const tagCounts: Record<string, number> = {};
  entries.forEach(e => {
    e.tags.forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30); // Show top 30 tags

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease' }}>
      
      {/* Overview Cards Row */}
      <div className="stats-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
        <div className="stats-card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Stories</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{totalEntries}</span>
        </div>
        <div className="stats-card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Tags</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{Object.keys(tagCounts).length}</span>
        </div>
        <div className="stats-card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Days</span>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{Object.keys(entriesByDate).length}</span>
        </div>
      </div>

      {/* Grid of Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        
        {/* Heatmap Grid */}
        <div className="stats-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Activity size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-primary)', margin: 0 }}>
              Writing Heatmap
            </h3>
          </div>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <div style={{ display: 'flex', gap: '3px', minWidth: '630px', paddingBottom: '4px' }}>
              {/* Day Labels */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', paddingRight: '8px', height: '80px', paddingTop: '4px', paddingBottom: '4px' }}>
                <span>Sun</span>
                <span>Wed</span>
                <span>Sat</span>
              </div>
              {/* Weeks */}
              {heatmapWeeks.map((week, wIdx) => (
                <div key={wIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {week.map((dateStr) => {
                    const count = entriesByDate[dateStr] || 0;
                    let cellColor = 'var(--bg-active)';
                    if (count === 1) cellColor = 'rgba(var(--accent-rgb), 0.25)';
                    else if (count === 2) cellColor = 'rgba(var(--accent-rgb), 0.55)';
                    else if (count >= 3) cellColor = 'var(--accent)';

                    return (
                      <div
                        key={dateStr}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay({
                            date: dateStr,
                            count,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8
                          });
                        }}
                        onMouseLeave={() => setHoveredDay(null)}
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '2px',
                          background: cellColor,
                          border: '1px solid var(--border-muted)',
                          transition: 'transform 0.1s ease',
                          cursor: 'pointer'
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Heatmap Legend */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            <span>Less</span>
            <div style={{ width: '8px', height: '8px', borderRadius: '1px', background: 'var(--bg-active)' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '1px', background: 'rgba(var(--accent-rgb), 0.25)' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '1px', background: 'rgba(var(--accent-rgb), 0.55)' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '1px', background: 'var(--accent)' }} />
            <span>More</span>
          </div>
        </div>

        {/* Two Columns for Donut Chart & Word Cloud */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          
          {/* Donut Chart */}
          <div className="stats-card" style={{ display: 'flex', flexDirection: 'column', padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <BarChart2 size={16} color="var(--accent)" />
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-primary)', margin: 0 }}>
                Mood Distribution
              </h3>
            </div>
            
            {totalEntries === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No entries recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ position: 'relative', width: '160px', height: '160px' }}>
                  <svg width="100%" height="100%" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                    {/* Background track circle */}
                    <circle cx="60" cy="60" r="50" fill="transparent" stroke="var(--bg-active)" strokeWidth="12" />
                    {(() => {
                      let currentOffset = 0;
                      const circ = 314.159;
                      return MOODS.map(m => {
                        const count = moodCounts[m.type] || 0;
                        if (count === 0) return null;
                        const pct = count / totalEntries;
                        const dashArrayStr = `${pct * circ} ${circ}`;
                        const dashOffsetVal = currentOffset;
                        currentOffset -= pct * circ;

                        const isHovered = hoveredMood === m.type;

                        return (
                          <circle
                            key={m.type}
                            cx="60"
                            cy="60"
                            r="50"
                            fill="transparent"
                            stroke={m.color}
                            strokeWidth={isHovered ? 16 : 12}
                            strokeDasharray={dashArrayStr}
                            strokeDashoffset={dashOffsetVal}
                            strokeLinecap="round"
                            style={{
                              transition: 'stroke-width 0.2s ease, opacity 0.2s ease',
                              cursor: 'pointer',
                              opacity: hoveredMood && !isHovered ? 0.4 : 1
                            }}
                            onMouseEnter={() => setHoveredMood(m.type)}
                            onMouseLeave={() => setHoveredMood(null)}
                          />
                        );
                      });
                    })()}
                  </svg>
                  {/* Center Text overlay */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    textAlign: 'center'
                  }}>
                    {hoveredMood ? (
                      <>
                        <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>
                          {MOODS.find(m => m.type === hoveredMood)?.icon}
                        </span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {moodCounts[hoveredMood]} {moodCounts[hoveredMood] === 1 ? 'Entry' : 'Entries'}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {Math.round((moodCounts[hoveredMood] / totalEntries) * 100)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                          {totalEntries}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                          Total
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Legend swatches */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', fontSize: '0.76rem' }}>
                  {MOODS.map(m => {
                    const count = moodCounts[m.type] || 0;
                    return (
                      <div
                        key={m.type}
                        onMouseEnter={() => setHoveredMood(m.type)}
                        onMouseLeave={() => setHoveredMood(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          background: hoveredMood === m.type ? 'var(--bg-active)' : 'transparent',
                          transition: 'background 0.15s ease',
                          cursor: 'pointer',
                          opacity: count === 0 ? 0.35 : 1
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{m.label}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>({count})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Word Cloud / Tags Panel */}
          <div className="stats-card" style={{ display: 'flex', flexDirection: 'column', padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Tag size={16} color="var(--accent)" />
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-primary)', margin: 0 }}>
                Popular Tags
              </h3>
            </div>

            {sortedTags.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No tags created yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start', flex: 1 }}>
                {sortedTags.map(([tag, count]) => {
                  // Font size base = 0.75rem, scale based on frequency
                  const maxCount = sortedTags[0][1];
                  const fontSize = 0.75 + (count / maxCount) * 0.65; // scale from 0.75rem to 1.4rem
                  
                  return (
                    <button
                      key={tag}
                      onClick={() => onSelectTag(tag)}
                      className="tag-chip"
                      style={{
                        fontSize: `${fontSize}rem`,
                        padding: `${4 + (count / maxCount) * 4}px ${10 + (count / maxCount) * 4}px`,
                        borderRadius: '20px',
                        background: 'var(--bg-active)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-secondary)',
                        transition: 'all 0.18s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.color = 'var(--accent)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      #{tag} <span style={{ fontSize: '0.7em', opacity: 0.6, fontWeight: 500 }}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 30-Day Timeline Area Chart */}
        <div className="stats-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-primary)', margin: 0 }}>
              30-Day Mood Trend
            </h3>
          </div>

          {timelinePoints.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '150px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No entries written in the last 30 days to plot mood trends.
            </div>
          ) : (
            <div style={{ width: '100%', overflowX: 'auto' }}>
              <div style={{ minWidth: '480px', position: 'relative' }}>
                <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ overflow: 'visible' }}>
                  {/* Grid Lines */}
                  {[1, 2, 3, 4, 5].map((lvl) => {
                    const y = paddingY + chartHeight - ((lvl - 1) / 4) * chartHeight;
                    return (
                      <g key={lvl}>
                        <line x1={paddingX} y1={y} x2={svgWidth - paddingX} y2={y} stroke="var(--border-muted)" strokeDasharray="3 3" strokeWidth="1" />
                        <text x={paddingX - 10} y={y + 4} textAnchor="end" style={{ fontSize: '9px', fill: 'var(--text-muted)', fontWeight: 600 }}>
                          {MOODS.find(m => moodScores[m.type] === lvl)?.icon}
                        </text>
                      </g>
                    );
                  })}

                  {/* Shaded Area */}
                  {timelinePoints.length > 1 && (
                    <path d={areaPath} fill="var(--accent)" fillOpacity="0.10" />
                  )}

                  {/* Connected Trend Line */}
                  {timelinePoints.length > 1 && (
                    <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  )}

                  {/* Vertex Points */}
                  {timelinePoints.map((p) => (
                    <circle
                      key={p.dateStr}
                      cx={p.x}
                      cy={p.y}
                      r={hoveredTimelinePoint?.dateStr === p.dateStr ? 6 : 4}
                      fill="var(--bg-card)"
                      stroke="var(--accent)"
                      strokeWidth="2"
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredTimelinePoint({
                          dateStr: p.dateStr,
                          score: p.score,
                          title: p.firstEntry.title,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8
                        });
                      }}
                      onMouseLeave={() => setHoveredTimelinePoint(null)}
                    />
                  ))}
                </svg>
              </div>
            </div>
          )}
          
          {/* Chart Label */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', paddingLeft: `${paddingX}px`, paddingRight: `${paddingX}px` }}>
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* HEATMAP HOVER TOOLTIP */}
      {hoveredDay && (
        <div style={{
          position: 'fixed',
          left: `${hoveredDay.x}px`,
          top: `${hoveredDay.y}px`,
          transform: 'translate(-50%, -100%)',
          zIndex: 99999,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '6px 10px',
          boxShadow: 'var(--shadow-md)',
          fontSize: '0.74rem',
          color: 'var(--text-primary)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          <strong style={{ display: 'block', color: 'var(--text-secondary)' }}>
            {new Date(hoveredDay.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </strong>
          <span>{hoveredDay.count} {hoveredDay.count === 1 ? 'story' : 'stories'}</span>
        </div>
      )}

      {/* TIMELINE HOVER TOOLTIP */}
      {hoveredTimelinePoint && (
        <div style={{
          position: 'fixed',
          left: `${hoveredTimelinePoint.x}px`,
          top: `${hoveredTimelinePoint.y}px`,
          transform: 'translate(-50%, -100%)',
          zIndex: 99999,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '6px 12px',
          boxShadow: 'var(--shadow-md)',
          fontSize: '0.74rem',
          color: 'var(--text-primary)',
          pointerEvents: 'none',
          maxWidth: '220px',
          whiteSpace: 'normal',
          wordBreak: 'break-word'
        }}>
          <strong style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
            {new Date(hoveredTimelinePoint.dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </strong>
          <div style={{ color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', margin: '2px 0' }}>
            <span>Score: {hoveredTimelinePoint.score.toFixed(1)} / 5.0</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>"{hoveredTimelinePoint.title}"</span>
        </div>
      )}
    </div>
  );
}

function App() {
  const [entries, setEntries] = useState<DiaryEntry[]>(() => DiaryStorageService.getAll());
  const [seeded, setSeeded] = useState(false);
  const [sortOption, setSortOption] = useState<'last_entry' | 'date' | 'name'>('last_entry');
  const [activeTheme, setActiveTheme] = useState<'ocean' | 'forest' | 'amber' | 'slate'>('ocean');
  const [customThemeColor, setCustomThemeColor] = useState<string>('#1A92B4');
  const [isCustomTheme, setIsCustomTheme] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('aurelius_theme_mode');
    if (saved !== null) {
      return saved === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fabRipple, setFabRipple] = useState(false);

  // Navigation states
  const [activeTab, setActiveTab] = useState<'entries' | 'calendar' | 'stats'>('entries');

  // Infinite-scroll feed state
  const INITIAL_VISIBLE = 5;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Search & Tag Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedWeathers, setSelectedWeathers] = useState<WeatherType[]>([]);
  const [filterLocation, setFilterLocation] = useState('');
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  // Formatting Toolbar states
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);


  // Month navigation states
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Drawer Form States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [targetDateString, setTargetDateString] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<MoodType>('calm');
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [temperature, setTemperature] = useState('24° / 16°');
  const [location, setLocation] = useState('Tokyo, Japan');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isAutoDetect, setIsAutoDetect] = useState(true);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [cardColor, setCardColor] = useState<string | undefined>(undefined);
  const [customColorInput, setCustomColorInput] = useState('');

  // Edit Mode States
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Draft Auto-Save State
  const [draftToRestore, setDraftToRestore] = useState<DraftData | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  // Context Menu State for formatting operations only
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    hasSelection: boolean;
  }>({ x: 0, y: 0, visible: false, hasSelection: false });

  // Close context menu on external click or Escape key
  useEffect(() => {
    const handleDocumentClick = () => {
      setContextMenu(prev => prev.visible ? { ...prev, visible: false, hasSelection: false } : prev);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(prev => prev.visible ? { ...prev, visible: false, hasSelection: false } : prev);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Sync content state to editor element when the drawer opens or when editing starts
  useEffect(() => {
    if (isDrawerOpen && contentRef.current) {
      const initialHtml = renderMarkdown(content);
      if (contentRef.current.innerHTML !== initialHtml) {
        contentRef.current.innerHTML = initialHtml;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawerOpen, editingEntryId]);

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    setContent(e.currentTarget.innerHTML);
  };

  // Selected entry for Hero Morph Modal
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);

  // Apply Theme + Mode attributes to HTML element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
    document.documentElement.setAttribute('data-mode', isDark ? 'dark' : 'light');
    localStorage.setItem('aurelius_theme_mode', isDark ? 'dark' : 'light');

    const root = document.documentElement;
    if (isCustomTheme && customThemeColor) {
      root.style.setProperty('--accent', customThemeColor);
      root.style.setProperty('--accent-dim', customThemeColor);
      root.style.setProperty('--accent-muted', customThemeColor);
      
      const hex = customThemeColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
      }
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-dim');
      root.style.removeProperty('--accent-muted');
      root.style.removeProperty('--accent-rgb');
    }
  }, [activeTheme, isDark, isCustomTheme, customThemeColor]);

  // Mode toggle with radial wipe from toggle button
  const toggleMode = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
    // Set CSS vars for radial wipe origin
    const root = document.documentElement;
    root.style.setProperty('--wipe-x', `${x}%`);
    root.style.setProperty('--wipe-y', `${y}%`);
    // Create & animate wipe layer
    const wipe = document.createElement('div');
    wipe.className = 'mode-wipe-layer';
    wipe.style.background = isDark ? 'var(--bg-secondary)' : '#0D0D12';
    document.body.appendChild(wipe);
    setTimeout(() => {
      setIsDark(v => !v);
      wipe.remove();
    }, 300);
  };


  // Check for unsaved draft when drawer opens
  const checkForDraft = (forEditId: string | null = null) => {
    const saved = localStorage.getItem('aurelius_draft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as DraftData;
        const hasContent = parsed.title?.trim() || parsed.content?.trim() || (parsed.tags && parsed.tags.length > 0);
        
        // Show restore if it has content AND:
        // - if we are writing a new entry (forEditId is null) and the draft is also for a new entry (editingEntryId is null)
        // - OR if we are editing an entry and the draft is for editing the same entry
        if (hasContent) {
          const modeMatch = forEditId === null 
            ? !parsed.isEditMode 
            : (parsed.isEditMode && parsed.editingEntryId === forEditId);
            
          if (modeMatch) {
            setDraftToRestore(parsed);
            return;
          }
        }
      } catch (e) {
        console.error('Failed to parse draft:', e);
      }
    }
    setDraftToRestore(null);
  };

  // Auto-save draft changes
  useEffect(() => {
    if (!isDrawerOpen) return;
    
    // Check if there is anything meaningful to save
    const hasContent = title.trim() || content.trim() || tags.length > 0;
    if (!hasContent) {
      // If the user cleared everything, remove the draft so we don't save a blank state
      localStorage.removeItem('aurelius_draft');
      return;
    }

    const draftData = {
      title,
      content,
      mood,
      weather,
      temperature,
      location,
      tags,
      cardColor,
      customColorInput,
      isEditMode,
      editingEntryId,
      targetDateString,
      savedAt: new Date().toISOString()
    };

    const timer = setTimeout(() => {
      localStorage.setItem('aurelius_draft', JSON.stringify(draftData));
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [title, content, mood, weather, temperature, location, tags, cardColor, customColorInput, isEditMode, editingEntryId, targetDateString, isDrawerOpen]);

  // Infinite-scroll: watch sentinel at the top of the feed and load more older entries
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsLoadingMore(true);
          // Small delay so the spinner is briefly visible (feels natural)
          setTimeout(() => {
            setVisibleCount(c => c + 5);
            setIsLoadingMore(false);
          }, 400);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []); // ref is stable, no deps needed


  const handleRestoreDraft = () => {
    if (!draftToRestore) return;
    const d = draftToRestore;
    setTitle(d.title || '');
    setContent(d.content || '');
    setMood(d.mood || 'calm');
    setWeather(d.weather || 'sunny');
    setTemperature(d.temperature || '24° / 16°');
    setLocation(d.location || 'Tokyo, Japan');
    setTags(d.tags || []);
    setCardColor(d.cardColor);
    setCustomColorInput(d.customColorInput || '');
    setIsEditMode(!!d.isEditMode);
    setEditingEntryId(d.editingEntryId || null);
    if (d.targetDateString) {
      setTargetDateString(d.targetDateString);
    }
    
    if (contentRef.current) {
      contentRef.current.innerHTML = d.content || '';
    }
    
    setDraftToRestore(null);
  };

  const handleDiscardDraft = () => {
    localStorage.removeItem('aurelius_draft');
    setDraftToRestore(null);
  };



  const getMockEntriesForCurrentDates = (): DiaryEntry[] => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return [
      {
        id: 'mock-1',
        title: '東京生活、楽しすぎる！',
        content: '昨日は瀧くんと入れ替わっていたみたい。東京のカフェ、パンケーキがすごく美味しかった！バイトの店長も親切。でも、ちょっと歩きすぎて足が痛いかも。いつか本当の東京に行ってみたいな。',
        createdAt: new Date(today.setHours(16, 21, 0, 0)).toISOString(),
        dateString: getLocalDateString(today),
        mood: 'joyful',
        weather: 'sunny',
        temperature: '26° / 18°',
        location: 'takayama-shi, Gifu, JAPAN',
        tags: ['東京生活', '入れ替わり', 'カフェ']
      },
      {
        id: 'mock-2',
        title: '学校生活と彗星 of 観測',
        content: '今日は一日、三葉の姿で過ごした。糸守は本当にのどかな町だ。御神体がある山頂からの景色は絶景だったな。夕方、みんなでテッシーの作った部室に集まった。夜空に見える彗星がどんどん大きくなっている気がする。',
        createdAt: new Date(yesterday.setHours(21, 12, 0, 0)).toISOString(),
        dateString: getLocalDateString(yesterday),
        mood: 'reflective',
        weather: 'clear',
        temperature: '21° / 13°',
        location: 'Itomori, Gifu, JAPAN',
        tags: ['糸守町', '彗星', '夕暮れ']
      }
    ];
  };

  const handleSeed = () => {
    const mockData = getMockEntriesForCurrentDates();
    mockData.forEach(entry => DiaryStorageService.save(entry));
    setEntries(DiaryStorageService.getAll());
    setSeeded(true);
    setTimeout(() => setSeeded(false), 2000);
  };

  const handleDelete = (id: string) => {
    DiaryStorageService.delete(id);
    setEntries(DiaryStorageService.getAll());
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all entries?')) {
      localStorage.clear();
      setEntries([]);
      setSeeded(false);
    }
  };


  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().toLowerCase().replace(/,/g, '');
      if (clean && !tags.includes(clean)) {
        setTags([...tags, clean]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setMood('calm');
    setWeather('sunny');
    setTemperature('24° / 16°');
    setLocation('Tokyo, Japan');
    setTags([]);
    setTagInput('');
    setCardColor(undefined);
    setCustomColorInput('');
    setIsEditMode(false);
    setEditingEntryId(null);
    setDraftToRestore(null);
  };

  const handleEditorContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    const selection = window.getSelection();
    const hasSelection = selection ? selection.toString().length > 0 : false;

    // Position bounding to prevent menu clipping.
    // Menu width is approx 220px, max menu height is approx 260px.
    const menuWidth = 220;
    const menuHeight = 260;

    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    x = Math.max(10, x);
    y = Math.max(10, y);

    setContextMenu({
      x,
      y,
      visible: true,
      hasSelection
    });
  };

  const applyFormat = (type: 'bold' | 'italic' | 'h1' | 'h2' | 'quote' | 'bullet' | 'code' | 'number') => {
    if (contentRef.current) {
      contentRef.current.focus();
    }

    switch (type) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'code': {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const selectedText = range.toString();
          const codeNode = document.createElement('code');
          codeNode.textContent = selectedText || 'code';
          range.deleteContents();
          range.insertNode(codeNode);

          range.setStartAfter(codeNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        break;
      }
      case 'h1':
        document.execCommand('formatBlock', false, 'H1');
        break;
      case 'h2':
        document.execCommand('formatBlock', false, 'H2');
        break;
      case 'quote':
        document.execCommand('formatBlock', false, 'BLOCKQUOTE');
        break;
      case 'bullet':
        document.execCommand('insertUnorderedList', false);
        break;
      case 'number':
        document.execCommand('insertOrderedList', false);
        break;
    }

    if (contentRef.current) {
      setContent(contentRef.current.innerHTML);
    }
  };

  const applyColorFormat = (color: string) => {
    if (contentRef.current) {
      contentRef.current.focus();
    }

    if (color === 'inherit') {
      document.execCommand('removeFormat', false);
    } else {
      document.execCommand('foreColor', false, color);
    }

    if (contentRef.current) {
      setContent(contentRef.current.innerHTML);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !targetDateString) return;

    const resolvedColor = customColorInput.trim() ? customColorInput.trim() : cardColor;

    if (isEditMode && editingEntryId) {
      // Update existing entry
      const existing = entries.find(en => en.id === editingEntryId);
      if (!existing) return;
      const updatedEntry: DiaryEntry = {
        ...existing,
        title: title.trim(),
        content: content.trim(),
        mood,
        weather,
        temperature,
        location: location.trim(),
        tags,
        cardColor: resolvedColor
      };
      DiaryStorageService.save(updatedEntry);
    } else {
      // Create new entry
      const newEntry: DiaryEntry = {
        id: `entry-${Date.now()}`,
        title: title.trim(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
        dateString: targetDateString,
        mood,
        weather,
        temperature,
        location: location.trim(),
        tags,
        cardColor: resolvedColor
      };
      DiaryStorageService.save(newEntry);
    }

    localStorage.removeItem('aurelius_draft');
    setEntries(DiaryStorageService.getAll());
    setIsDrawerOpen(false);
    setSelectedEntry(null);
    resetForm();
  };

  const downloadJSONBackup = () => {
    const dataStr = JSON.stringify(entries, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurelius_backup_${getLocalDateString(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadMarkdownZip = async () => {
    try {
      const zip = new JSZip();
      
      entries.forEach((entry) => {
        const markdownContent = `---
title: ${entry.title}
date: ${entry.dateString}
created_at: ${entry.createdAt}
mood: ${entry.mood}
weather: ${entry.weather}
temperature: ${entry.temperature || ''}
location: ${entry.location}
tags: ${entry.tags.join(', ')}
card_color: ${entry.cardColor || ''}
---

${stripMarkdown(entry.content)}
`;
        
        const safeTitle = entry.title.replace(/[\\/:*?"<>|]/g, '_') || 'untitled';
        const filename = `${entry.dateString}_${safeTitle}.md`;
        
        zip.file(filename, markdownContent);
      });
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aurelius_diary_backup_${getLocalDateString(new Date())}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate Markdown zip:', error);
      alert('Failed to export Markdown backup. Please try again.');
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (!Array.isArray(imported)) {
          alert('Invalid backup file. Must be a JSON array of entries.');
          return;
        }

        const validEntries: DiaryEntry[] = [];
        let invalidCount = 0;
        for (const item of imported) {
          if (item && typeof item === 'object' && item.id && item.title && item.content && item.dateString && item.mood && item.weather) {
            validEntries.push({
              id: String(item.id),
              title: String(item.title),
              content: String(item.content),
              createdAt: item.createdAt ? String(item.createdAt) : new Date().toISOString(),
              dateString: String(item.dateString),
              mood: item.mood as MoodType,
              weather: item.weather as WeatherType,
              temperature: item.temperature ? String(item.temperature) : undefined,
              location: item.location ? String(item.location) : 'Unknown',
              tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
              cardColor: item.cardColor ? String(item.cardColor) : undefined
            });
          } else {
            invalidCount++;
          }
        }

        if (validEntries.length === 0) {
          alert('No valid diary entries found in the file.');
          return;
        }

        if (invalidCount > 0) {
          if (!confirm(`Found ${invalidCount} invalid/malformed entries. Continue importing the other ${validEntries.length} entries?`)) {
            return;
          }
        }

        const existingMap = new Map(entries.map(en => [en.id, en]));
        let newCount = 0;
        let updateCount = 0;

        validEntries.forEach((entry) => {
          if (existingMap.has(entry.id)) {
            existingMap.set(entry.id, entry);
            updateCount++;
          } else {
            existingMap.set(entry.id, entry);
            newCount++;
          }
        });

        const merged = Array.from(existingMap.values());
        setEntries(merged);
        merged.forEach(entry => DiaryStorageService.save(entry));
        alert(`Import complete! Added ${newCount} new entries, updated ${updateCount} existing entries.`);
      } catch (error) {
        console.error('Failed to import backup JSON:', error);
        alert('Failed to parse backup JSON file. Ensure it is a valid backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };


  const fetchAutoDetectInfo = async () => {
    setIsLoadingWeather(true);
    try {
      const loc = await detectLocation();
      setLocation(loc.city);
      const w = await fetchWeather(loc.lat, loc.lon);
      setTemperature(w.temp);
      setWeather(w.weatherType);
    } catch (error) {
      console.error('Auto detection failed:', error);
      setLocation('Tokyo, Japan');
    } finally {
      setIsLoadingWeather(false);
    }
  };

  const openWriterForDate = (dateStr: string) => {
    setTargetDateString(dateStr);
    resetForm();
    setIsDrawerOpen(true);
    checkForDraft(null);
    if (isAutoDetect) {
      fetchAutoDetectInfo();
    } else {
      setLocation('Tokyo, Japan');
    }
  };

  const openEditorForEntry = (entry: DiaryEntry) => {
    setIsEditMode(true);
    setEditingEntryId(entry.id);
    setTargetDateString(entry.dateString);
    setTitle(entry.title);
    setContent(entry.content);
    setMood(entry.mood);
    setWeather(entry.weather);
    setTemperature(entry.temperature ?? '');
    setLocation(entry.location);
    setTags(entry.tags);
    setCardColor(entry.cardColor);
    setCustomColorInput('');
    setIsAutoDetect(false); // Don't auto-detect when editing; keep saved values
    setSelectedEntry(null);
    setIsDrawerOpen(true);
    checkForDraft(entry.id);
  };

  // Calendar Engine: Generate grid arrays for the currentMonth/currentYear
  const calendarCells = (() => {
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = startOfMonth.getDay(); // 0 is Sunday
    const cellsList = [];

    // Prior Month Padding days
    const prevMonthEnd = new Date(currentYear, currentMonth, 0);
    const prevMonthDaysCount = prevMonthEnd.getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cellsList.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthDaysCount - i),
        isCurrentMonth: false
      });
    }

    // Current Month days
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const currentMonthDaysCount = currentMonthEnd.getDate();
    for (let i = 1; i <= currentMonthDaysCount; i++) {
      cellsList.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true
      });
    }

    // Remaining empty days to pad to a multiple of 7
    const totalSlots = Math.ceil(cellsList.length / 7) * 7;
    const paddingNeeded = totalSlots - cellsList.length;
    for (let i = 1; i <= paddingNeeded; i++) {
      cellsList.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false
      });
    }

    return cellsList;
  })();

  // Month navigations helpers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Filter entries based on search queries
  const baseFilteredEntries = entries.filter((entry) => {
    const matchesQuery = searchQuery.trim() === '' || 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTags = selectedTags.length === 0 ||
      selectedTags.every(tag => entry.tags.includes(tag));

    const matchesWeather = selectedWeathers.length === 0 ||
      selectedWeathers.includes(entry.weather);

    const matchesLocation = filterLocation.trim() === '' ||
      entry.location.toLowerCase().includes(filterLocation.toLowerCase());

    const matchesColor = selectedColors.length === 0 ||
      selectedColors.includes(entry.cardColor || MOODS.find(m => m.type === entry.mood)?.color || '');

    return matchesQuery && matchesTags && matchesWeather && matchesLocation && matchesColor;
  });


  const sortEntriesArray = (arr: DiaryEntry[]) => {
    return arr.slice().sort((a, b) => {
      if (sortOption === 'name') {
        return a.title.localeCompare(b.title);
      } else if (sortOption === 'date') {
        return new Date(b.dateString).getTime() - new Date(a.dateString).getTime();
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  };

  const filteredEntries = sortEntriesArray(baseFilteredEntries);

  // Unique tags across all entries
  const allUniqueTags = Array.from(new Set(entries.flatMap(e => e.tags)));

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 18 } }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minHeight: '100vh',
      paddingBottom: '6rem',
      position: 'relative',
      overflowX: 'hidden',
      background: 'var(--bg-primary)',
      transition: 'background 0.6s ease'
    }}>
      {/* Drifting Abstract Background Shapes */}
      <div className="bg-shapes-container">
        <div className="bg-shape circle-shape" />
        <div className="bg-shape semi-shape" />
        <div className="bg-shape triangle-shape" />
        <div className="bg-shape square-shape" />
      </div>
      {/* ─── STICKY FROSTED HEADER ─────────────────────────── */}
      <header className="app-header logo-animate" style={{
        width: '100%',
        padding: '14px 24px',
        marginBottom: '0',
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '720px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Row 1: Logo + Mode Toggle + Settings */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="logo-badge">
                <BookOpen size={18} color="#fff" />
              </div>
              <h1 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.65rem',
                fontWeight: 700,
                letterSpacing: '-0.5px',
                color: 'var(--text-primary)'
              }}>
                Aurelius
              </h1>
            </div>

            {/* Right controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Mode toggle */}
              <div
                className={`mode-toggle-track ${!isDark ? 'on' : ''}`}
                onClick={toggleMode}
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                role="switch"
                aria-checked={!isDark}
              >
                <div className={`mode-toggle-thumb ${!isDark ? 'on' : ''}`}>
                  <span className="mode-toggle-icon" style={{ fontSize: '10px' }}>
                    {isDark ? '🌙' : '☀️'}
                  </span>
                </div>
              </div>

              {/* Settings button */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                title="Settings"
              >
                <Menu size={16} />
              </button>
            </div>
          </div>

          {/* Row 2: Pill Tabs + Entry Count */}
          <div className="nav-animate" style={{ animationDelay: '60ms', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="tab-bar" style={{ width: 'fit-content' }}>
              <button
                onClick={() => setActiveTab('entries')}
                className={`tab-button ${activeTab === 'entries' ? 'active' : ''}`}
              >
                {activeTab === 'entries' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="tab-indicator"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                Entries
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`tab-button ${activeTab === 'calendar' ? 'active' : ''}`}
              >
                {activeTab === 'calendar' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="tab-indicator"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                Calendar
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`tab-button ${activeTab === 'stats' ? 'active' : ''}`}
              >
                {activeTab === 'stats' && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="tab-indicator"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                Analytics
              </button>
            </div>
            {entries.length > 0 && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ──────────────────────────────────── */}
      <main style={{ width: '100%', maxWidth: '720px', padding: '24px 24px 0', zIndex: 1, minHeight: '60vh' }}>

        
        {/* TAB 1: ENTRIES FEED */}
        {activeTab === 'entries' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Search and Tag Ribbon */}
            <div className="solid-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Search Bar Row */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div className="search-container" style={{ flex: 1 }}>
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search title, story, tags..."
                    className="search-input"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                {/* Advanced filters toggle */}
                <button
                  type="button"
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    borderRadius: '20px',
                    border: '1px solid var(--border)',
                    backgroundColor: isFiltersExpanded ? 'var(--bg-active)' : 'var(--bg-hover)',
                    color: isFiltersExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Settings size={14} className={isFiltersExpanded ? 'spin-anim' : ''} />
                  Filters
                </button>
              </div>

              {/* Collapsible Advanced Filters Section */}
              <AnimatePresence>
                {isFiltersExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}
                  >
                    {/* Row 1: Location & Colors */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                      {/* Location Input */}
                      <div>
                        <span className="form-label" style={{ fontSize: '0.65rem', marginBottom: '4px' }}>Location</span>
                        <div style={{ position: 'relative' }}>
                          <MapPin size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            value={filterLocation}
                            onChange={(e) => setFilterLocation(e.target.value)}
                            placeholder="Filter by city/country..."
                            className="form-input"
                            style={{ paddingLeft: '34px', fontSize: '0.8rem', borderRadius: '14px' }}
                          />
                        </div>
                      </div>

                      {/* Card Color Filter */}
                      <div>
                        <span className="form-label" style={{ fontSize: '0.65rem', marginBottom: '4px' }}>Card Color</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', height: '36px' }}>
                          {CARD_COLOR_PRESETS.map((preset) => {
                            const isSelected = selectedColors.includes(preset.hex);
                            return (
                              <button
                                key={preset.hex}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedColors(selectedColors.filter(c => c !== preset.hex));
                                  } else {
                                    setSelectedColors([...selectedColors, preset.hex]);
                                  }
                                }}
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  backgroundColor: preset.hex,
                                  border: `2px solid ${isSelected ? 'var(--text-primary)' : 'transparent'}`,
                                  boxShadow: isSelected ? `0 0 0 1px ${preset.hex}` : 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                title={preset.label}
                              />
                            );
                          })}
                          {selectedColors.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedColors([])}
                              style={{ fontSize: '0.68rem', color: 'var(--accent)', fontWeight: 600, marginLeft: '6px', cursor: 'pointer' }}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Weather Selectors */}
                    <div>
                      <span className="form-label" style={{ fontSize: '0.65rem', marginBottom: '4px' }}>Weather</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(Object.keys(WEATHER_ICONS) as WeatherType[]).map((wKey) => {
                          const isSelected = selectedWeathers.includes(wKey);
                          return (
                            <button
                              key={wKey}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedWeathers(selectedWeathers.filter(w => w !== wKey));
                                } else {
                                  setSelectedWeathers([...selectedWeathers, wKey]);
                                }
                              }}
                              className={`tag-chip ${isSelected ? 'selected' : ''}`}
                              style={{ display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '12px' }}
                            >
                              <span>{WEATHER_ICONS[wKey].emoji}</span>
                              <span>{WEATHER_ICONS[wKey].label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tag filters (Multi-Select) */}
              {allUniqueTags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', borderTop: isFiltersExpanded ? '1px solid var(--border)' : 'none', paddingTop: isFiltersExpanded ? '12px' : '0' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tags:</span>
                  {allUniqueTags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTags(selectedTags.filter(t => t !== tag));
                          } else {
                            setSelectedTags([...selectedTags, tag]);
                          }
                        }}
                        className={`tag-chip ${isSelected ? 'selected' : ''}`}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                  {(selectedTags.length > 0 || selectedWeathers.length > 0 || filterLocation || selectedColors.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTags([]);
                        setSelectedWeathers([]);
                        setFilterLocation('');
                        setSelectedColors([]);
                      }}
                      style={{ fontSize: '0.7rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, marginLeft: '4px' }}
                    >
                      Reset All ×
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable date tiles feed */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              layout
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
              {(searchQuery || selectedTags.length > 0 || selectedWeathers.length > 0 || filterLocation || selectedColors.length > 0) ? (
                filteredEntries.length > 0 ? (
                  filteredEntries.map((entry, idx) => {
                    const parsedDate = parseLocalDate(entry.dateString);
                    const moodData = MOODS.find(m => m.type === entry.mood);
                    const accentColor = entry.cardColor ?? moodData?.color ?? 'var(--accent)';
                    return (
                      <motion.article
                        key={entry.id}
                        layout
                        variants={itemVariants}
                        className="io-card"
                        style={{ display: 'flex', gap: '16px', alignItems: 'stretch', width: '100%', animationDelay: `${idx * 60}ms` }}
                      >
                        {/* Date column */}
                        <div className="date-column">
                          <span className="date-day-number" style={{ color: accentColor }}>{parsedDate.getDate().toString().padStart(2, '0')}</span>
                          <span className="date-day-label">{parsedDate.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                        </div>

                        {/* Card */}
                        <div
                          className="entry-card"
                          style={{ flex: 1, '--card-accent': accentColor } as React.CSSProperties}
                          onClick={() => setSelectedEntry(entry)}
                        >
                          {/* Meta pill */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="entry-meta-pill">
                              <span>{new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                              <span className="entry-meta-dot">•</span>
                              <span>{WEATHER_ICONS[entry.weather]?.emoji} {WEATHER_ICONS[entry.weather]?.label}</span>
                              <span className="entry-meta-dot">•</span>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: moodData?.color, display: 'inline-block', flexShrink: 0 }} />
                              <span>{moodData?.label}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px', flexShrink: 0 }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{entry.title}</h2>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {stripMarkdown(entry.content)}
                          </p>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              <MapPin size={10} />
                              <span>{entry.location}</span>
                            </div>
                            <span className="view-arrow">View →</span>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-card)', color: 'var(--text-muted)' }}>
                    No matches found. Try modifying your query...
                  </div>
                )
              ) : (() => {
                // All entries sorted according to sortOption, only real entries
                const sortedEntries = sortEntriesArray(entries);
                const shownEntries = sortedEntries.slice(0, visibleCount);
                const hasMore = sortedEntries.length > visibleCount;


                if (sortedEntries.length === 0) {
                  return (
                    <motion.div
                      variants={itemVariants}
                      onClick={() => openWriterForDate(getLocalDateString(new Date()))}
                      style={{
                        border: '2px dashed var(--border-subtle)',
                        borderRadius: '16px',
                        padding: '3.5rem 2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'all 0.25s ease'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                    >
                      <PlusCircle size={36} color="var(--accent-color)" />
                      <div style={{ textAlign: 'center' }}>
                        <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>No entries yet</h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.35rem 0 0' }}>Click here or tap the pen button to write your first entry</p>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <>
                    {/* Infinite-scroll sentinel — IntersectionObserver watches this */}
                    {hasMore && (
                      <>
                        <div ref={sentinelRef} style={{ height: '1px', width: '100%' }} />
                        {isLoadingMore && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            padding: '0.6rem',
                            color: 'var(--text-muted)',
                            fontSize: '0.78rem',
                            fontWeight: 500
                          }}>
                            <span style={{
                              width: '14px',
                              height: '14px',
                              border: '2px solid var(--border-subtle)',
                              borderTopColor: 'var(--accent-color)',
                              borderRadius: '50%',
                              display: 'inline-block',
                              animation: 'spin 0.7s linear infinite'
                            }} />
                            Loading older entries…
                          </div>
                        )}
                      </>
                    )}

                    {/* Entry cards – newest at bottom of list, oldest loaded at top */}
                {shownEntries.slice().reverse().map((entry, idx) => {
                      const parsedDate = parseLocalDate(entry.dateString);
                      const moodData = MOODS.find(m => m.type === entry.mood);
                      const accentColor = entry.cardColor ?? moodData?.color ?? 'var(--accent)';
                      return (
                        <motion.article
                          key={entry.id}
                          layout
                          variants={itemVariants}
                          className="io-card"
                          style={{ display: 'flex', gap: '16px', alignItems: 'stretch', width: '100%' }}
                        >
                          {/* Date column */}
                          <div className="date-column">
                            <span className="date-day-number" style={{ color: accentColor, animationDelay: `${idx * 40}ms` }}>
                              {parsedDate.getDate().toString().padStart(2, '0')}
                            </span>
                            <span className="date-day-label">{parsedDate.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                          </div>

                          {/* Entry card */}
                          <div
                            className="entry-card"
                            style={{ flex: 1, '--card-accent': accentColor } as React.CSSProperties}
                            onClick={() => setSelectedEntry(entry)}
                          >
                            {/* Meta pill row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div className="entry-meta-pill">
                                <span>{new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                <span className="entry-meta-dot">•</span>
                                <span>{WEATHER_ICONS[entry.weather]?.emoji} {WEATHER_ICONS[entry.weather]?.label}</span>
                                {entry.temperature && (<><span className="entry-meta-dot">•</span><span>{entry.temperature}</span></>)}
                                <span className="entry-meta-dot">•</span>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: moodData?.color, display: 'inline-block', flexShrink: 0 }} />
                                <span>{moodData?.label}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditorForEntry(entry); }}
                                  style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                  title="Edit"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                                  style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '6px', flexShrink: 0 }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{entry.title}</h2>

                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {stripMarkdown(entry.content)}
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                <MapPin size={9} />
                                <span>{entry.location}</span>
                              </div>
                              <span className="view-arrow">View →</span>
                            </div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}

        {/* TAB 2: MONTHLY CALENDAR GRID VIEW */}
        {activeTab === 'calendar' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}
          >
            {/* Calendar Pager Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '1rem 1.5rem',
              width: '100%'
            }}>
              <button
                onClick={handlePrevMonth}
                style={{
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronLeft size={16} />
              </button>

              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600 }}>
                {new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>

              <button
                onClick={handleNextMonth}
                style={{
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Grid Box */}
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '20px',
              padding: '1.5rem',
              width: '100%'
            }}>
              {/* Weekdays Row */}
              <div className="calendar-grid" style={{ marginBottom: '0.5rem' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="calendar-header-day">{day}</div>
                ))}
              </div>

              {/* Grid cells */}
              <div className="calendar-grid">
                {calendarCells.map((cell, idx) => {
                  const cellDateStr = getLocalDateString(cell.date);
                  const matchingEntry = entries.find(e => e.dateString === cellDateStr);

                  return (
                    <div
                      key={`${cellDateStr}-${idx}`}
                      onClick={() => {
                        if (matchingEntry) {
                          setSelectedEntry(matchingEntry);
                        } else {
                          openWriterForDate(cellDateStr);
                        }
                      }}
                      className={`calendar-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${matchingEntry ? 'has-entry' : ''}`}
                      style={matchingEntry?.cardColor ? {
                        borderColor: matchingEntry.cardColor,
                        boxShadow: `0 0 12px ${matchingEntry.cardColor}40`,
                        background: `radial-gradient(circle at center, ${matchingEntry.cardColor}18 0%, var(--bg-card) 100%)`
                      } : {}}
                    >
                      <div className="calendar-cell-number">
                        {cell.date.getDate()}
                      </div>

                      {matchingEntry && (
                        <div className="calendar-cell-indicators">
                          <span className="calendar-cell-mood">
                            {MOODS.find(m => m.type === matchingEntry.mood)?.icon}
                          </span>
                          <span
                            className="calendar-cell-dot"
                            style={matchingEntry.cardColor ? {
                              backgroundColor: matchingEntry.cardColor,
                              boxShadow: `0 0 8px ${matchingEntry.cardColor}`
                            } : {}}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 3: STATS DASHBOARD */}
        {activeTab === 'stats' && (
          <AnalyticsDashboard
            entries={entries}
            onSelectTag={(tag) => {
              setSelectedTags([tag]);
              setIsFiltersExpanded(true);
              setActiveTab('entries');
            }}
          />
        )}
      </main>

      {/* FAB — Floating Action Button */}
      <button
        className="fab-btn"
        onClick={(e) => {
          setFabRipple(true);
          setTimeout(() => setFabRipple(false), 600);
          openWriterForDate(getLocalDateString(new Date()));
          void e;
        }}
        title="Write Today's Entry"
        aria-label="Write new diary entry"
      >
        {fabRipple && <span className="fab-ripple" />}
        <PenTool size={22} color="#ffffff" />
      </button>

      {/* Side Creator Drawer Overlay and Panel */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsDrawerOpen(false);
                resetForm();
              }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#000000',
                zIndex: 100,
                backdropFilter: 'blur(4px)'
              }}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 200 }}
              className="settings-panel"
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                maxWidth: '520px',
                zIndex: 101,
                padding: '2.5rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto'
              }}
            >
              {/* Drawer Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isEditMode ? <Pencil size={18} color="var(--accent-color)" /> : <PenTool size={18} color="var(--accent-color)" />}
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 600 }}>
                    {isEditMode
                      ? `Edit — ${parseLocalDate(targetDateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : `Write for ${parseLocalDate(targetDateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    resetForm();
                  }}
                  style={{
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderRadius: '50%',
                    padding: '0.35rem',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-subtle)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Draft Restore Banner */}
              <AnimatePresence>
                {draftToRestore && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      overflow: 'hidden',
                      marginBottom: '1.5rem'
                    }}
                  >
                    <div style={{
                      background: 'rgba(217, 119, 6, 0.08)',
                      border: '1px solid rgba(217, 119, 6, 0.2)',
                      borderLeft: '4px solid #d97706',
                      borderRadius: '12px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>📝</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b', margin: 0 }}>
                            Unsaved Draft Found
                          </p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                            We found an auto-saved draft from {(() => {
                              const dt = draftToRestore.savedAt ? new Date(draftToRestore.savedAt) : new Date();
                              return `${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${dt.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
                            })()}.
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleRestoreDraft}
                          style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            background: '#d97706',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#b45309'}
                          onMouseLeave={e => e.currentTarget.style.background = '#d97706'}
                        >
                          Restore Draft
                        </button>
                        <button
                          type="button"
                          onClick={handleDiscardDraft}
                          style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                            e.currentTarget.style.color = '#ef4444';
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Form */}
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
                
                {/* Auto detect controller */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="autoDetectLocationWeather"
                      checked={isAutoDetect}
                      onChange={(e) => setIsAutoDetect(e.target.checked)}
                      style={{
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer',
                        accentColor: 'var(--accent)'
                      }}
                    />
                    <label htmlFor="autoDetectLocationWeather" style={{ fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      Auto-detect Location & Weather
                    </label>
                  </div>
                  {isAutoDetect && (
                    <button
                      type="button"
                      onClick={fetchAutoDetectInfo}
                      disabled={isLoadingWeather}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-color)',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        borderRadius: '6px',
                        transition: 'all 0.15s ease',
                        border: '1px solid var(--border-subtle)',
                        background: 'transparent'
                      }}
                      title="Re-detect Location and Weather"
                    >
                      <RefreshCw size={12} className={isLoadingWeather ? 'spin-anim' : ''} />
                    </button>
                  )}
                </div>

                {/* Date Selection */}
                <div>
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    required
                    value={targetDateString}
                    onChange={(e) => setTargetDateString(e.target.value)}
                    className="form-input"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="form-label">Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Capture this moment..."
                    className="form-input"
                  />
                </div>

                {/* Weather & Temperature & Location Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label className="form-label">Location</label>
                    <input
                      type="text"
                      required
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g., Tokyo, Japan"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Temperature</label>
                    <input
                      type="text"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      placeholder="e.g., 26° / 18°"
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Weather Chooser */}
                <div>
                  <label className="form-label">Weather</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {(Object.keys(WEATHER_ICONS) as WeatherType[]).map((wKey) => {
                      const isSelected = weather === wKey;
                      return (
                        <button
                          type="button"
                          key={wKey}
                          onClick={() => setWeather(wKey)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                            background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-card)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.25rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ fontSize: '1.1rem' }}>{WEATHER_ICONS[wKey].emoji}</span>
                          <span style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {WEATHER_ICONS[wKey].label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mood Selector Grid */}
                <div>
                  <label className="form-label">How are you feeling?</label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '0.5rem',
                    marginTop: '0.5rem'
                  }}>
                    {MOODS.map((m) => {
                      const isSelected = mood === m.type;
                      return (
                        <motion.button
                          type="button"
                          key={m.type}
                          onClick={() => setMood(m.type)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.75rem 0.25rem',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            border: '1px solid',
                            borderColor: isSelected ? m.color : 'var(--border-subtle)',
                            background: isSelected ? `${m.color}0a` : 'var(--bg-card)',
                            transition: 'border-color 0.2s ease, background 0.2s ease'
                          }}
                        >
                          <span style={{ fontSize: '1.25rem' }}>{m.icon}</span>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                          }}>
                            {m.label}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Content — Live Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  {/* Label row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>Your Story</label>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', letterSpacing: '0.2px' }}>
                      Right-click selected text to format
                    </span>
                  </div>

                  {/* Formatting Toolbar */}
                  <div className="formatting-toolbar" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '12px 12px 0 0',
                    backgroundColor: 'var(--bg-card)',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      type="button"
                      onClick={() => applyFormat('bold')}
                      className="toolbar-btn"
                      title="Bold (Ctrl+B)"
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('italic')}
                      className="toolbar-btn"
                      title="Italic (Ctrl+I)"
                    >
                      <Italic size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('code')}
                      className="toolbar-btn"
                      title="Monospace (Ctrl+Shift+M)"
                    >
                      <Code2 size={14} />
                    </button>
                    
                    <div style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 4px' }} />

                    <button
                      type="button"
                      onClick={() => applyFormat('h1')}
                      className="toolbar-btn"
                      title="Heading 1 (Ctrl+Shift+1)"
                    >
                      <Heading1 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('h2')}
                      className="toolbar-btn"
                      title="Heading 2 (Ctrl+Shift+2)"
                    >
                      <Heading2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('quote')}
                      className="toolbar-btn"
                      title="Blockquote (Ctrl+Shift+.)"
                    >
                      <Quote size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('bullet')}
                      className="toolbar-btn"
                      title="Bullet List (Ctrl+Shift+L)"
                    >
                      <List size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat('number')}
                      className="toolbar-btn"
                      title="Numbered List"
                    >
                      <ListOrdered size={14} />
                    </button>

                    <div style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 4px' }} />

                    {/* Text Color Swatch Button & Popover */}
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setIsColorPopoverOpen(!isColorPopoverOpen)}
                        className={`toolbar-btn ${isColorPopoverOpen ? 'active' : ''}`}
                        title="Text Color"
                      >
                        <span style={{ fontSize: '13px', fontWeight: 'bold', textDecoration: 'underline', color: 'var(--accent)', lineHeight: 1 }}>A</span>
                      </button>
                      
                      {isColorPopoverOpen && (
                        <>
                          <div
                            onClick={() => setIsColorPopoverOpen(false)}
                            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            marginTop: '6px',
                            zIndex: 1000,
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            padding: '8px',
                            boxShadow: 'var(--shadow-md)',
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap',
                            width: '160px'
                          }}>
                            {TEXT_COLORS.map(c => (
                              <button
                                key={c.color}
                                type="button"
                                title={c.name}
                                onClick={() => {
                                  applyColorFormat(c.color);
                                  setIsColorPopoverOpen(false);
                                }}
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  backgroundColor: c.color === 'inherit' ? 'transparent' : c.color,
                                  border: c.color === 'inherit' ? '1px dashed var(--text-muted)' : '1px solid var(--border)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '9px',
                                  color: 'var(--text-muted)'
                                }}
                              >
                                {c.color === 'inherit' && '✕'}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Rich Text Editor — WYSIWYG editor */}
                  <div
                    ref={contentRef}
                    contentEditable={true}
                    onInput={handleEditorInput}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); applyFormat('bold'); }
                      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); applyFormat('italic'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); applyFormat('code'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '1') { e.preventDefault(); applyFormat('h1'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '2') { e.preventDefault(); applyFormat('h2'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '.') { e.preventDefault(); applyFormat('quote'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); applyFormat('bullet'); }
                    }}
                    onContextMenu={handleEditorContextMenu}
                    className="rich-editor prose"
                    style={{
                      minHeight: '220px',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      borderRadius: '0 0 12px 12px',
                      fontFamily: 'var(--font-sans)',
                      lineHeight: 1.75,
                      fontSize: '0.93rem',
                      padding: '12px 16px',
                      border: '1px solid var(--border)',
                      borderTop: 'none',
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="form-label">Tags</label>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Add tags (press Enter or comma)"
                    className="form-input"
                  />
                  {tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      <AnimatePresence>
                        {tags.map((t) => (
                          <motion.span
                            key={t}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-primary)',
                              background: 'var(--bg-active)',
                              border: '1px solid var(--border)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            #{t}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(t)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: 'var(--text-muted)',
                                cursor: 'pointer'
                              }}
                            >
                              <X size={10} />
                            </button>
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* Card Color Picker */}
                <div>
                  <label className="form-label">Card Color</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {/* Color preview strip */}
                    <div style={{
                      height: '44px',
                      borderRadius: '10px',
                      background: customColorInput.trim()
                        ? customColorInput.trim()
                        : cardColor
                          ? getEntryAccentColor(cardColor)
                          : 'var(--accent)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.8)',
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                      transition: 'background 0.3s ease'
                    }}>
                      {(cardColor || customColorInput.trim()) ? '✦ Preview' : 'Theme Default'}
                    </div>

                    {/* Preset swatches */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {/* "None" / Reset swatch */}
                      <button
                        type="button"
                        onClick={() => { setCardColor(undefined); setCustomColorInput(''); }}
                        title="Use theme default"
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          border: `2px solid ${!cardColor && !customColorInput.trim() ? 'var(--text-primary)' : 'var(--border)'}`,
                          background: 'var(--bg-active)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          transition: 'all 0.15s ease',
                          flexShrink: 0
                        }}
                      >✕</button>

                      {CARD_COLOR_PRESETS.map((preset) => {
                        const isSelected = cardColor === preset.hex && !customColorInput.trim();
                        return (
                          <button
                            type="button"
                            key={preset.hex}
                            onClick={() => { setCardColor(preset.hex); setCustomColorInput(''); }}
                            title={preset.label}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: preset.hex,
                              cursor: 'pointer',
                              border: `2px solid ${isSelected ? 'var(--text-primary)' : 'transparent'}`,
                              boxShadow: isSelected ? `0 0 0 2px ${preset.hex}` : 'none',
                              transition: 'all 0.15s ease',
                              flexShrink: 0
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Custom hex input */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={customColorInput.trim() || cardColor || '#3B82F6'}
                        onChange={(e) => { setCustomColorInput(e.target.value); setCardColor(undefined); }}
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-card)',
                          cursor: 'pointer',
                          padding: '2px'
                        }}
                        title="Pick a custom color"
                      />
                      <input
                        type="text"
                        value={customColorInput}
                        onChange={(e) => { setCustomColorInput(e.target.value); if (e.target.value) setCardColor(undefined); }}
                        placeholder="#hex or any CSS color"
                        className="form-input"
                        style={{ flex: 1, padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      resetForm();
                    }}
                    style={{
                      flex: 1,
                      padding: '0.875rem',
                      borderRadius: '12px',
                      border: '1px solid var(--border-subtle)',
                      background: 'transparent',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!title.trim() || !content.trim()}
                    style={{
                      flex: 2,
                      padding: '0.875rem',
                      borderRadius: '12px',
                      background: 'var(--accent-gradient)',
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: (!title.trim() || !content.trim()) ? 0.4 : 1,
                      pointerEvents: (!title.trim() || !content.trim()) ? 'none' : 'auto',
                      boxShadow: '0 4px 20px var(--accent-glow)'
                    }}
                  >
                    {isEditMode ? 'Update Entry' : 'Save Entry'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Side Drawer */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#000000',
                zIndex: 100,
                backdropFilter: 'blur(4px)'
              }}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 200 }}
              className="settings-panel"
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                maxWidth: '400px',
                zIndex: 101,
                padding: '2.5rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto'
              }}
            >
              {/* Drawer Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Settings size={18} color="var(--accent-color)" />
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 600 }}>
                    Settings
                  </h2>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  style={{
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    borderRadius: '50%',
                    padding: '0.35rem',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    background: 'transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-subtle)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Settings Sections */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flex: 1 }}>
                
                {/* 1. Mode Toggle */}
                <div>
                  <label className="form-label">Appearance</label>
                  <div style={{
                    marginTop: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '14px 18px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.1rem' }}>{isDark ? '🌙' : '☀️'}</span>
                      <div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{isDark ? 'Dark Mode' : 'Light Mode'}</p>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{isDark ? 'Easy on the eyes at night' : 'Clear and bright'}</p>
                      </div>
                    </div>
                    <div
                      className={`mode-toggle-track ${!isDark ? 'on' : ''}`}
                      onClick={toggleMode}
                      role="switch"
                      aria-checked={!isDark}
                    >
                      <div className={`mode-toggle-thumb ${!isDark ? 'on' : ''}`}>
                        <span className="mode-toggle-icon" style={{ fontSize: '10px' }}>{isDark ? '🌙' : '☀️'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Palette Chooser (Horizontal Row) */}
                <div>
                  <label className="form-label">Theme Palette</label>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-around',
                    gap: '8px',
                    marginTop: '10px',
                    padding: '16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px'
                  }}>
                    {THEMES.map((theme) => {
                      const isSelected = !isCustomTheme && activeTheme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => {
                            setIsCustomTheme(false);
                            setActiveTheme(theme.id);
                          }}
                          title={theme.name}
                          className={`theme-swatch ${isSelected ? 'selected' : ''}`}
                          style={{
                            background: theme.color,
                            '--swatch-color': theme.color
                          } as React.CSSProperties}
                        >
                          {isSelected && <Check size={18} color="var(--text-on-accent)" />}
                        </button>
                      );
                    })}

                    {/* Custom Color Picker Swatch */}
                    <div
                      style={{
                        position: 'relative',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        border: `2px solid ${isCustomTheme ? 'var(--text-primary)' : 'transparent'}`,
                        transition: 'transform 0.18s ease, border-color 0.18s ease',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isCustomTheme ? customThemeColor : 'conic-gradient(red, yellow, green, cyan, blue, magenta, red)',
                      }}
                      title="Custom Accent Color"
                    >
                      <input
                        type="color"
                        value={customThemeColor}
                        onChange={(e) => {
                          setIsCustomTheme(true);
                          setCustomThemeColor(e.target.value);
                        }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer',
                        }}
                      />
                      {isCustomTheme && <Check size={18} color="#ffffff" />}
                    </div>
                  </div>
                </div>

                {/* Sort Option */}
                <div>
                  <label className="form-label">Sort Entries</label>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    marginTop: '0.5rem'
                  }}>
                    {(['last_entry', 'date', 'name'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSortOption(opt)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          background: sortOption === opt ? 'var(--accent-subtle)' : 'transparent',
                          border: '1px solid',
                          borderColor: sortOption === opt ? 'var(--accent)' : 'var(--border)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: sortOption === opt ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {opt === 'last_entry' ? 'Last Entry (Default)' : opt === 'date' ? 'Date (Journal)' : 'Name (Alphabetical)'}
                        </span>
                        {sortOption === opt && <Check size={14} color="var(--accent)" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Backup & Export Options */}
                <div>
                  <label className="form-label">Backup & Export</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={downloadJSONBackup}
                      disabled={entries.length === 0}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: entries.length === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        opacity: entries.length === 0 ? 0.5 : 1,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={e => { if (entries.length > 0) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <Download size={14} />
                      Download JSON Backup
                    </button>

                    <button
                      type="button"
                      onClick={downloadMarkdownZip}
                      disabled={entries.length === 0}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: entries.length === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        opacity: entries.length === 0 ? 0.5 : 1,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={e => { if (entries.length > 0) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <Download size={14} />
                      Download Markdown Zip
                    </button>

                    {/* Import Button with Hidden File Input */}
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportJSON}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          cursor: 'pointer',
                          zIndex: 2
                        }}
                      />
                      <button
                        type="button"
                        style={{
                          width: '100%',
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          pointerEvents: 'none'
                        }}
                      >
                        <Upload size={14} />
                        Import JSON Backup
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Demo Data Actions */}
                <div>
                  <label className="form-label">Actions</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => {
                        handleSeed();
                        setIsSettingsOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: seeded ? 'var(--success-subtle)' : 'var(--bg-card)',
                        color: seeded ? 'var(--success)' : 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {seeded ? <Check size={16} /> : <PlusCircle size={16} />}
                      {seeded ? 'Seeded Successfully!' : 'Seed Demo entries'}
                    </button>

                    {entries.length > 0 && (
                      <button
                        className="danger-btn"
                        onClick={() => {
                          if (confirm('Are you sure you want to clear all entries? This cannot be undone.')) {
                            handleClearAll();
                            setIsSettingsOpen(false);
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '0.75rem 1rem',
                          borderRadius: '12px',
                          border: '1px solid var(--danger-border)',
                          background: 'var(--danger-subtle)',
                          color: 'var(--danger)',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Trash2 size={15} />
                        Clear All Data
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Journal Statistics */}
                <div style={{
                  marginTop: 'auto',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Total Entries</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entries.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>Active Tags</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{allUniqueTags.length}</span>
                  </div>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Fullscreen Reading Hero Morph Modal */}
      <AnimatePresence>
        {selectedEntry && (
          <>
            {/* Backdrop Blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEntry(null)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#030303',
                zIndex: 200,
                backdropFilter: 'blur(8px)'
              }}
            />

            {/* Morph Card Center Layout */}
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 201,
              padding: '2rem'
            }}>
              <motion.div
                layoutId={selectedEntry.id}
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: 'var(--shadow-lg)',
                  maxHeight: '85vh',
                  overflow: 'hidden'
                }}
              >
                {/* Colored Header Block */}
                <div style={{
                  background: getEntryAccentColor(selectedEntry.cardColor),
                  padding: '2.5rem 2rem 2rem',
                  position: 'relative',
                  color: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem'
                }}>
                  {/* Edit Button — top left */}
                  <button
                    onClick={() => openEditorForEntry(selectedEntry)}
                    style={{
                      position: 'absolute',
                      top: '1.25rem',
                      left: '1.25rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      cursor: 'pointer',
                      borderRadius: '50%',
                      padding: '0.35rem',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      background: 'transparent'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Edit this entry"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Close Button overlay */}
                  <button
                    onClick={() => setSelectedEntry(null)}
                    style={{
                      position: 'absolute',
                      top: '1.25rem',
                      right: '1.25rem',
                      color: 'rgba(255, 255, 255, 0.8)',
                      cursor: 'pointer',
                      borderRadius: '50%',
                      padding: '0.35rem',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      background: 'transparent'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Close"
                  >
                    <X size={16} />
                  </button>

                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    color: 'rgba(255, 255, 255, 0.75)'
                  }}>
                    {parseLocalDate(selectedEntry.dateString).toLocaleDateString(undefined, { month: 'long' })}
                  </div>

                  <div style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '4.5rem',
                    fontWeight: 800,
                    lineHeight: 0.9,
                    letterSpacing: '-2px',
                    color: '#ffffff'
                  }}>
                    {parseLocalDate(selectedEntry.dateString).getDate().toString().padStart(2, '0')}
                  </div>

                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.85)'
                  }}>
                    {parseLocalDate(selectedEntry.dateString).toLocaleDateString(undefined, { weekday: 'long' })}. {new Date(selectedEntry.createdAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    })}
                  </div>

                  {/* Meteorological and Location Ribbon */}
                  <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    fontSize: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.15)',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '30px',
                    marginTop: '0.25rem',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    fontWeight: 500
                  }}>
                    <span>
                      {WEATHER_ICONS[selectedEntry.weather]?.emoji} {WEATHER_ICONS[selectedEntry.weather]?.label.toUpperCase()} {selectedEntry.temperature}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                      <MapPin size={10} /> {selectedEntry.location}
                    </span>
                    <span>•</span>
                    <span>
                      {MOODS.find(m => m.type === selectedEntry.mood)?.icon} {MOODS.find(m => m.type === selectedEntry.mood)?.label.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div style={{
                  padding: '2rem',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem'
                }}>
                  {/* Title */}
                  <h2 style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.65rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    lineHeight: 1.3
                  }}>
                    {selectedEntry.title}
                  </h2>

                  {/* Text copy — rendered markdown */}
                  <div
                    className="prose"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedEntry.content) }}
                  />

                  {/* Tags List */}
                  {selectedEntry.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                      {selectedEntry.tags.map(tag => (
                        <span key={tag} style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-active)',
                          border: '1px solid var(--border)',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Format Context Menu — formatting options only */}
      {contextMenu.visible && (
        <div
          className="custom-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 99999,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Menu header label */}
          <div style={{
            padding: '4px 14px 6px',
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 4
          }}>
            {contextMenu.hasSelection ? 'Format Selection' : 'Insert Format'}
          </div>

          {/* Inline formats */}
          <div className="menu-item" onClick={() => { applyFormat('bold'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><Bold size={13} style={{ marginRight: 8 }} /> Bold</span>
            <span className="menu-shortcut">Ctrl+B</span>
          </div>
          <div className="menu-item" onClick={() => { applyFormat('italic'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><Italic size={13} style={{ marginRight: 8 }} /> Italic</span>
            <span className="menu-shortcut">Ctrl+I</span>
          </div>
          <div className="menu-item" onClick={() => { applyFormat('code'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><Code2 size={13} style={{ marginRight: 8 }} /> Monospace</span>
            <span className="menu-shortcut">Ctrl+Shift+M</span>
          </div>

          <div className="menu-separator" />

          {/* Block formats */}
          <div className="menu-item" onClick={() => { applyFormat('h1'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><Heading1 size={13} style={{ marginRight: 8 }} /> Heading 1</span>
            <span className="menu-shortcut">Ctrl+Shift+1</span>
          </div>
          <div className="menu-item" onClick={() => { applyFormat('h2'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><Heading2 size={13} style={{ marginRight: 8 }} /> Heading 2</span>
            <span className="menu-shortcut">Ctrl+Shift+2</span>
          </div>
          <div className="menu-item" onClick={() => { applyFormat('quote'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><Quote size={13} style={{ marginRight: 8 }} /> Blockquote</span>
            <span className="menu-shortcut">Ctrl+Shift+.</span>
          </div>
          <div className="menu-item" onClick={() => { applyFormat('bullet'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><List size={13} style={{ marginRight: 8 }} /> Bullet List</span>
            <span className="menu-shortcut">Ctrl+Shift+L</span>
          </div>

          <div className="menu-separator" />
          <div style={{ padding: '6px 14px 8px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
              Text Color
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {TEXT_COLORS.map(c => (
                <button
                  key={c.color}
                  title={c.name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => {
                    applyColorFormat(c.color);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: c.color,
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
              
              {/* Custom Rainbow Color Picker */}
              <div
                title="Custom Color"
                style={{
                  position: 'relative',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'conic-gradient(red, yellow, green, cyan, blue, magenta, red)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <input
                  type="color"
                  onChange={(e) => {
                    applyColorFormat(e.target.value);
                    setContextMenu(prev => ({ ...prev, visible: false }));
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                  }}
                />
              </div>

              <button
                title="Clear Color"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => {
                  applyColorFormat('inherit');
                  setContextMenu(prev => ({ ...prev, visible: false }));
                }}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  border: '1px dashed var(--text-muted)',
                  color: 'var(--text-muted)',
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
