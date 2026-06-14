import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Trash2, PlusCircle, Check, X, PenTool, Cloud, Sun, CloudRain, Snowflake, Moon, MapPin, Search, ChevronLeft, ChevronRight, RefreshCw, Pencil, Bold, Italic, Code2, Heading1, Heading2, Quote, List, Minus as DividerIcon } from 'lucide-react';
import type { DiaryEntry, MoodType, WeatherType } from './types';
import { DiaryStorageService } from './utils/storage';
import { detectLocation, fetchWeather } from './utils/weather';
import { renderMarkdown, stripMarkdown } from './utils/markdown';


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
  { type: 'joyful', label: 'Joyful', icon: '☀️', color: '#eab308' },
  { type: 'calm', label: 'Calm', icon: '🍃', color: '#22c55e' },
  { type: 'reflective', label: 'Reflective', icon: '🌌', color: '#a855f7' },
  { type: 'tired', label: 'Tired', icon: '💤', color: '#3b82f6' },
  { type: 'anxious', label: 'Anxious', icon: '☁️', color: '#64748b' }
];

const THEMES = [
  { id: 'mitsuha', name: 'Mitsuha Twilight', color: '#ec4899' },
  { id: 'taki', name: 'Taki Daybreak', color: '#06b6d4' },
  { id: 'comet', name: 'Itomori Comet', color: '#8b5cf6' },
  { id: 'amber', name: 'Sunny Amber', color: '#f59e0b' }
] as const;

// Per-entry card color presets
const CARD_COLOR_PRESETS = [
  { label: 'Rose Dawn',    hex: '#f43f5e', gradient: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 50%, #d946ef 100%)' },
  { label: 'Cyan Ocean',  hex: '#06b6d4', gradient: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 50%, #059669 100%)' },
  { label: 'Comet',       hex: '#8b5cf6', gradient: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #ec4899 100%)' },
  { label: 'Amber Flame', hex: '#f59e0b', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #ea580c 100%)' },
  { label: 'Forest',      hex: '#10b981', gradient: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #06b6d4 100%)' },
  { label: 'Midnight',    hex: '#6366f1', gradient: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #8b5cf6 100%)' },
  { label: 'Sakura',      hex: '#fb7185', gradient: 'linear-gradient(135deg, #fb7185 0%, #f43f5e 50%, #f97316 100%)' },
  { label: 'Lime',        hex: '#84cc16', gradient: 'linear-gradient(135deg, #84cc16 0%, #22c55e 50%, #10b981 100%)' },
  { label: 'Marigold',    hex: '#f97316', gradient: 'linear-gradient(135deg, #fb923c 0%, #f97316 50%, #eab308 100%)' },
  { label: 'Slate',       hex: '#94a3b8', gradient: 'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #475569 100%)' },
];

/**
 * Returns a gradient string for an entry's header banner.
 * Uses the entry's own cardColor if set, falls back to CSS theme variable.
 */
const getEntryHeaderGradient = (cardColor?: string): string => {
  if (!cardColor) return 'var(--theme-header-bg)';
  const preset = CARD_COLOR_PRESETS.find(p => p.hex === cardColor);
  if (preset) return preset.gradient;
  // Custom hex: build a linear gradient from the hex color
  return `linear-gradient(135deg, ${cardColor} 0%, ${cardColor}cc 60%, ${cardColor}88 100%)`;
};

function App() {
  const [entries, setEntries] = useState<DiaryEntry[]>(() => DiaryStorageService.getAll());
  const [seeded, setSeeded] = useState(false);
  const [activeTheme, setActiveTheme] = useState<'mitsuha' | 'taki' | 'comet' | 'amber'>('mitsuha');

  // Navigation states
  const [activeTab, setActiveTab] = useState<'entries' | 'calendar'>('entries');

  // Search & Tag Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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

  const contentRef = useRef<HTMLTextAreaElement>(null);
  // Saves selection BEFORE right-click can move the cursor and clear it.
  // Both handleContextMenu and applyFormat read from this ref.
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

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

  // Selected entry for Hero Morph Modal
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);

  // Apply Theme attribute to HTML element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [activeTheme]);



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
  };

  /**
   * Opens the custom context menu for text formatting and editing operations.
   */
  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const el = contentRef.current;
    if (!el) return;

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

    const hasSelection = selectionRef.current.start !== selectionRef.current.end;
    setContextMenu({
      x,
      y,
      visible: true,
      hasSelection
    });
  };

  /**
   * Applies a markdown format to the selected text in the content textarea.
   * Block-level formats (headings, quote, bullet, divider) auto-insert newlines
   * so they never get concatenated with adjacent text.
   */
  const applyFormat = (type: 'bold' | 'italic' | 'h1' | 'h2' | 'quote' | 'bullet' | 'divider' | 'code') => {
    const el = contentRef.current;
    if (!el) return;
    const start = selectionRef.current.start;
    const end = selectionRef.current.end;
    const selected = content.substring(start, end);
    const before = content.substring(0, start);
    const after = content.substring(end);

    // For block-level formats, ensure there's a newline before insertion
    // if we're not already at the start of a line
    const isBlockType = ['h1', 'h2', 'quote', 'bullet', 'divider'].includes(type);
    const needsNewlineBefore = isBlockType && before.length > 0 && !before.endsWith('\n');
    const needsNewlineAfter = isBlockType && after.length > 0 && !after.startsWith('\n');
    const nlBefore = needsNewlineBefore ? '\n' : '';
    const nlAfter = needsNewlineAfter ? '\n' : '';

    let core = '';
    let cursorOffset = 0;

    switch (type) {
      case 'bold': {
        const inner = selected || 'bold text';
        core = `**${inner}**`;
        cursorOffset = selected ? core.length : core.length - 2;
        break;
      }
      case 'italic': {
        const inner = selected || 'italic text';
        core = `*${inner}*`;
        cursorOffset = selected ? core.length : core.length - 1;
        break;
      }
      case 'code': {
        const inner = selected || 'code';
        core = `\`${inner}\``;
        cursorOffset = selected ? core.length : core.length - 1;
        break;
      }
      case 'h1':
        core = `# ${selected || 'Heading'}`;
        cursorOffset = nlBefore.length + core.length;
        break;
      case 'h2':
        core = `## ${selected || 'Subheading'}`;
        cursorOffset = nlBefore.length + core.length;
        break;
      case 'quote':
        core = `> ${selected || 'Quote your thoughts...'}`;
        cursorOffset = nlBefore.length + core.length;
        break;
      case 'bullet':
        core = `- ${selected || 'List item'}`;
        cursorOffset = nlBefore.length + core.length;
        break;
      case 'divider':
        core = `---`;
        cursorOffset = nlBefore.length + core.length;
        break;
    }

    const replacement = `${nlBefore}${core}${nlAfter}`;
    const newContent = before + replacement + after;
    setContent(newContent);

    // Restore focus and reposition cursor after React re-render
    requestAnimationFrame(() => {
      if (!contentRef.current) return;
      contentRef.current.focus();
      const newPos = start + cursorOffset;
      contentRef.current.setSelectionRange(newPos, newPos);
    });
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

    setEntries(DiaryStorageService.getAll());
    setIsDrawerOpen(false);
    setSelectedEntry(null);
    resetForm();
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
      if (activeTheme === 'taki') {
        setLocation('Tokyo, Japan');
      } else {
        setLocation('Itomori, Gifu, JAPAN');
      }
    } finally {
      setIsLoadingWeather(false);
    }
  };

  const openWriterForDate = (dateStr: string) => {
    setTargetDateString(dateStr);
    resetForm();
    setIsDrawerOpen(true);
    if (isAutoDetect) {
      fetchAutoDetectInfo();
    } else {
      if (activeTheme === 'taki') {
        setLocation('Tokyo, Japan');
      } else {
        setLocation('Itomori, Gifu, JAPAN');
      }
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
  };

  // Generate date list: last 7 days including today
  const datesList = (() => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      list.push(d);
    }
    return list;
  })();

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
  const filteredEntries = entries.filter((entry) => {
    const matchesQuery = searchQuery.trim() === '' || 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTag = !selectedTag || entry.tags.includes(selectedTag);

    return matchesQuery && matchesTag;
  });

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
      padding: '2.5rem 1.5rem',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Background glow orb */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, var(--accent-color) 0%, transparent 70%)',
        opacity: 0.1,
        filter: 'blur(90px)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Header Container */}
      <header style={{
        width: '100%',
        maxWidth: '720px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        marginBottom: '2.5rem',
        zIndex: 1
      }}>
        {/* Row 1: Logo & Seeds */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              background: 'var(--accent-gradient)',
              borderRadius: '10px',
              padding: '0.45rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BookOpen size={18} color="#fff" />
            </div>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.6rem',
              fontWeight: 600,
              letterSpacing: '-0.5px'
            }}>
              Aurelius
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={handleSeed}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                background: seeded ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)',
                color: seeded ? '#22c55e' : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.2s ease'
              }}
            >
              {seeded ? <Check size={14} /> : <PlusCircle size={14} />}
              {seeded ? 'Seeded!' : 'Seed Demo'}
            </button>

            {entries.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'rgba(239, 68, 68, 0.05)',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Tabs Switcher (Segmented Control matching Anime Screen) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '1rem' }}>
          <div className="tab-bar" style={{ width: '260px' }}>
            <button
              onClick={() => setActiveTab('entries')}
              className={`tab-button ${activeTab === 'entries' ? 'active' : ''}`}
            >
              Entries
              {activeTab === 'entries' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'var(--accent-gradient)',
                    borderRadius: '11px',
                    zIndex: -1
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`tab-button ${activeTab === 'calendar' ? 'active' : ''}`}
            >
              Calendar
              {activeTab === 'calendar' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'var(--accent-gradient)',
                    borderRadius: '11px',
                    zIndex: -1
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          </div>

          {/* Theme Switcher Ribbon */}
          <div style={{ display: 'flex', gap: '0.35rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-subtle)', padding: '0.2rem', borderRadius: '10px' }}>
            {THEMES.map((theme) => {
              const isSelected = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => setActiveTheme(theme.id)}
                  title={theme.name}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: theme.color,
                    cursor: 'pointer',
                    border: '2px solid',
                    borderColor: isSelected ? '#ffffff' : 'transparent',
                    boxShadow: isSelected ? '0 0 10px var(--accent-color)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                />
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Tab Contents */}
      <main style={{ width: '100%', maxWidth: '720px', zIndex: 1, minHeight: '60vh' }}>
        
        {/* TAB 1: ENTRIES FEED */}
        {activeTab === 'entries' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Search and Tag Ribbon overlays */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '1.25rem'
            }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title, story, tags..."
                  className="form-input"
                  style={{ paddingLeft: '2.75rem' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Tag filters strip */}
              {allUniqueTags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '0.25rem' }}>
                    Tags:
                  </span>
                  {allUniqueTags.map(tag => {
                    const isSelected = selectedTag === tag;
                    return (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(isSelected ? null : tag)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--accent-color)' : 'var(--border-subtle)',
                          background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag(null)}
                      style={{ fontSize: '0.7rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600, marginLeft: '0.25rem' }}
                    >
                      Clear Filter
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
              {/* If search/tag filtering is active, only show cards matching, otherwise full 7-day calendar tiles */}
              {(searchQuery || selectedTag) ? (
                filteredEntries.length > 0 ? (
                  filteredEntries.map((entry) => {
                    const parsedDate = parseLocalDate(entry.dateString);
                    return (
                      <motion.article
                        key={entry.id}
                        layout
                        variants={itemVariants}
                        onClick={() => setSelectedEntry(entry)}
                        style={{
                          display: 'flex',
                          gap: '1.25rem',
                          alignItems: 'stretch',
                          width: '100%'
                        }}
                      >
                        {/* Left date digits */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '64px', flexShrink: 0 }}>
                          <span style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, color: 'var(--accent-color)' }}>
                            {parsedDate.getDate().toString().padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                            {parsedDate.toLocaleDateString(undefined, { weekday: 'short' })}
                          </span>
                        </div>

                        {/* Right card content */}
                        <div
                          style={{
                            flex: 1,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '16px',
                            padding: '1.25rem 1.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            position: 'relative'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              <span style={{ fontWeight: 600 }}>
                                {new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                              <span>•</span>
                              <span>{WEATHER_ICONS[entry.weather]?.emoji} {WEATHER_ICONS[entry.weather]?.label}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', borderRadius: '4px' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600 }}>{entry.title}</h2>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{entry.content}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <MapPin size={10} />
                            <span>{entry.location}</span>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border-subtle)', borderRadius: '16px', color: 'var(--text-muted)' }}>
                    <span>No matches found. Try modifying your query...</span>
                  </div>
                )
              ) : (
                datesList.map((dateObj) => {
                  const dateStr = getLocalDateString(dateObj);
                  const matchingEntry = entries.find(e => e.dateString === dateStr);

                  return (
                    <motion.article
                      key={dateStr}
                      layout
                      variants={itemVariants}
                      style={{
                        display: 'flex',
                        gap: '1.25rem',
                        alignItems: 'stretch',
                        width: '100%'
                      }}
                    >
                      {/* Left Date Column */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '64px', flexShrink: 0 }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '2.5rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: matchingEntry ? (matchingEntry.cardColor ?? 'var(--accent-color)') : 'var(--text-muted)',
                          transition: 'color 0.25s ease'
                        }}>
                          {dateObj.getDate().toString().padStart(2, '0')}
                        </span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                          {dateObj.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                      </div>

                      {/* Right Card Column */}
                      {matchingEntry ? (
                        <div
                          onClick={() => setSelectedEntry(matchingEntry)}
                          style={{
                            flex: 1,
                            background: 'var(--bg-card)',
                            border: `1px solid ${matchingEntry.cardColor ? matchingEntry.cardColor + '60' : 'var(--border-subtle)'}`,
                            borderRadius: '16px',
                            padding: '1.25rem 1.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            position: 'relative',
                            boxShadow: matchingEntry.cardColor ? `0 0 0 0 ${matchingEntry.cardColor}20` : 'none',
                            transition: 'box-shadow 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              <span style={{ fontWeight: 600 }}>
                                {new Date(matchingEntry.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                              <span>•</span>
                              <span>{WEATHER_ICONS[matchingEntry.weather]?.emoji} {WEATHER_ICONS[matchingEntry.weather]?.label}</span>
                              {matchingEntry.temperature && (
                                <>
                                  <span>•</span>
                                  <span>{matchingEntry.temperature}</span>
                                </>
                              )}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(matchingEntry.id); }}
                              style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', borderRadius: '4px' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600 }}>{matchingEntry.title}</h2>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap' }}>
                            {stripMarkdown(matchingEntry.content)}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <MapPin size={10} />
                            <span>{matchingEntry.location}</span>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => openWriterForDate(dateStr)}
                          style={{
                            flex: 1,
                            border: '1px dashed var(--border-subtle)',
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '1.25rem 1.5rem',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            transition: 'all 0.25s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>No entry written yet...</span>
                          <PlusCircle size={18} />
                        </div>
                      )}
                    </motion.article>
                  );
                })
              )}
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
      </main>

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
              style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                maxWidth: '520px',
                backgroundColor: '#08080a',
                borderLeft: '1px solid var(--border-subtle)',
                boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.7)',
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

              {/* Form */}
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
                
                {/* Auto detect controller */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.01)',
                  border: '1px solid var(--border-subtle)',
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
                        accentColor: 'var(--accent-color)'
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
                            borderColor: isSelected ? 'var(--accent-color)' : 'var(--border-subtle)',
                            background: isSelected ? 'rgba(255,255,255,0.05)' : 'var(--bg-card)',
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

                  {/* Textarea — clean editor, no toolbar */}
                  <textarea
                    ref={contentRef}
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onMouseDown={(e) => {
                      // Save selection on right-click BEFORE the browser moves the cursor and clears it
                      if (e.button === 2) {
                        const el = contentRef.current;
                        if (el) selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
                      }
                    }}
                    onSelect={() => {
                      // Keep selectionRef in sync whenever selection changes via mouse
                      const el = contentRef.current;
                      if (el) selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
                    }}
                    onKeyUp={() => {
                      // Catch keyboard-driven selection (Shift+Arrow, Ctrl+A, etc.)
                      const el = contentRef.current;
                      if (el) selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
                    }}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); applyFormat('bold'); }
                      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); applyFormat('italic'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') { e.preventDefault(); applyFormat('code'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '1') { e.preventDefault(); applyFormat('h1'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '2') { e.preventDefault(); applyFormat('h2'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '.') { e.preventDefault(); applyFormat('quote'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); applyFormat('bullet'); }
                      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); applyFormat('divider'); }
                    }}
                    onContextMenu={handleContextMenu}
                    placeholder={"Write your story...\n\nRight-click to format selected text.\nCtrl+B bold  ·  Ctrl+I italic  ·  Ctrl+Shift+M code"}
                    className="form-input form-textarea"
                    style={{
                      minHeight: '160px',
                      resize: 'vertical',
                      borderRadius: '12px',
                      fontFamily: 'var(--font-sans)',
                      lineHeight: 1.75,
                      fontSize: '0.93rem',
                    }}
                  />

                  {/* Live Preview — always visible, updates as user types */}
                  {content.trim() && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.8px',
                        fontWeight: 600,
                        marginBottom: '0.4rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: 6, height: 6,
                          borderRadius: '50%',
                          background: 'var(--accent-color)',
                          boxShadow: '0 0 6px var(--accent-color)',
                          animation: 'pulse-dot 2s ease-in-out infinite'
                        }} />
                        Live Preview
                      </div>
                      <div
                        className="prose"
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '12px',
                          padding: '1rem 1.25rem',
                          maxHeight: '180px',
                          overflowY: 'auto',
                          fontSize: '0.875rem',
                        }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                      />
                    </div>
                  )}
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
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid var(--border-subtle)',
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
                        ? `linear-gradient(135deg, ${customColorInput.trim()} 0%, ${customColorInput.trim()}cc 60%, ${customColorInput.trim()}88 100%)`
                        : cardColor
                          ? getEntryHeaderGradient(cardColor)
                          : 'var(--theme-header-bg)',
                      border: '1px solid rgba(255,255,255,0.1)',
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
                          border: `2px solid ${!cardColor && !customColorInput.trim() ? '#ffffff' : 'rgba(255,255,255,0.15)'}`,
                          background: 'rgba(255,255,255,0.05)',
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
                              border: `2px solid ${isSelected ? '#ffffff' : 'transparent'}`,
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
                        value={customColorInput.trim() || cardColor || '#ec4899'}
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
                  backgroundColor: '#0c0c0e',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
                  maxHeight: '85vh',
                  overflow: 'hidden'
                }}
              >
                {/* Colored Header Block (Your Name design) */}
                <div style={{
                  background: getEntryHeaderGradient(selectedEntry.cardColor),
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
                  >
                    <X size={16} />
                  </button>

                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    opacity: 0.85
                  }}>
                    {parseLocalDate(selectedEntry.dateString).toLocaleDateString(undefined, { month: 'long' })}
                  </div>

                  <div style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '4.5rem',
                    fontWeight: 700,
                    lineHeight: 0.9,
                    letterSpacing: '-2px'
                  }}>
                    {parseLocalDate(selectedEntry.dateString).getDate().toString().padStart(2, '0')}
                  </div>

                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    opacity: 0.9
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
                    background: 'rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '30px',
                    marginTop: '0.25rem',
                    border: '1px solid rgba(255,255,255,0.15)'
                  }}>
                    <span>
                      {WEATHER_ICONS[selectedEntry.weather]?.emoji} {WEATHER_ICONS[selectedEntry.weather]?.label.toUpperCase()} {selectedEntry.temperature}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                      <MapPin size={10} /> {selectedEntry.location}
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
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-subtle)',
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
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Menu header label */}
          <div style={{
            padding: '4px 14px 6px',
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
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
          <div className="menu-item" onClick={() => { applyFormat('divider'); setContextMenu(prev => ({ ...prev, visible: false })); }}>
            <span className="menu-label-icon"><DividerIcon size={13} style={{ marginRight: 8 }} /> Divider Line</span>
            <span className="menu-shortcut">Ctrl+Shift+D</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
