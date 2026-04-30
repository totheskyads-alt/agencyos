'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/useRole';
import { getProjectAccess, visibleClientIdsFromProjects } from '@/lib/projectAccess';
import {
  createEmptyHealth,
  deriveHealthInsight,
  getHealthBucket,
  getHealthLabel,
  getHealthTone,
  HEALTH_BUCKETS,
  isWhiteLabelClient,
} from '@/lib/clientHealth';
import { loadHealthMap, saveHealthRecord } from '@/lib/clientHealthStore';
import ClientHealthSummaryCard from '@/components/ClientHealthSummaryCard';
import ClientHealthSheet from '@/components/ClientHealthSheet';
import { AlertTriangle, HeartPulse, Layers3, ShieldCheck, Sparkles } from 'lucide-react';

function OverviewTile({ bucket, count, tone, active, onClick }) {
  const activeClass = active
    ? bucket.key === 'needs_attention'
      ? 'ring-2 ring-red-400 shadow-ios-md -translate-y-0.5 bg-red-50/50'
      : bucket.key === 'fragile'
        ? 'ring-2 ring-amber-300 shadow-ios-md -translate-y-0.5 bg-amber-50/60'
        : bucket.key === 'great'
          ? 'ring-2 ring-emerald-300 shadow-ios-md -translate-y-0.5 bg-emerald-50/60'
          : 'ring-2 ring-ios-blue shadow-ios-md -translate-y-0.5 bg-blue-50/50'
    : 'hover:-translate-y-0.5 hover:shadow-ios-md';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-4 text-left transition-all ${activeClass}`}
    >
      <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center mb-3 border ${tone.badge}`}>
        <span className="text-xl">{bucket.emoji}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-title2 font-bold text-ios-primary">{count}</p>
          <p className="text-subhead font-semibold text-ios-primary mt-1">{bucket.label}</p>
        </div>
        <span className="text-caption1 font-semibold text-ios-secondary">{active ? 'Showing' : 'View'}</span>
      </div>
      <p className="text-footnote text-ios-secondary mt-2 leading-6">{bucket.description}</p>
    </button>
  );
}

function getActionTone(filter) {
  if (filter === 'needs_attention') return 'border-red-200 bg-red-50/80';
  if (filter === 'fragile') return 'border-amber-200 bg-amber-50/80';
  if (filter === 'great') return 'border-emerald-200 bg-emerald-50/80';
  return 'border-blue-200 bg-blue-50/70';
}

export default function ClientHealthPage() {
  const { can, isManager } = useRole();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetEntity, setSheetEntity] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const canViewClientHealth = can('canViewClientHealth');

  useEffect(() => {
    if (!canViewClientHealth) return;
    load();
  }, [canViewClientHealth]);

  async function load() {
    setLoading(true);
    const accessInfo = await getProjectAccess();
    if (accessInfo.isRestricted && accessInfo.projectIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    let projectQuery = supabase
      .from('projects')
      .select('id,name,color,client_id,clients(id,name,client_type,type)')
      .order('name');
    if (accessInfo.isRestricted) projectQuery = projectQuery.in('id', accessInfo.projectIds);
    const { data: projectData } = await projectQuery;
    const projects = projectData || [];

    const visibleClientIds = accessInfo.isRestricted
      ? visibleClientIdsFromProjects(projects)
      : null;

    let clientQuery = supabase.from('clients').select('id,name,client_type,type').order('name');
    if (accessInfo.isRestricted) {
      if (!visibleClientIds.length) {
        setItems([]);
        setLoading(false);
        return;
      }
      clientQuery = clientQuery.in('id', visibleClientIds);
    }
    const { data: clientData } = await clientQuery;
    const clients = clientData || [];

    const directClients = clients.filter(client => !isWhiteLabelClient(client));
    const whiteLabelProjects = projects.filter(project => isWhiteLabelClient(project.clients));

    const [clientHealthMap, projectHealthMap] = await Promise.all([
      loadHealthMap('client', directClients.map(client => client.id)),
      loadHealthMap('project', whiteLabelProjects.map(project => project.id)),
    ]);

    const directItems = directClients.map(client => ({
      id: `client:${client.id}`,
      scope_type: 'client',
      scope_id: client.id,
      name: client.name,
      subtitle: 'Direct client',
      searchText: `${client.name} direct client`,
      health: clientHealthMap[client.id] || {
        ...createEmptyHealth('client', client.id),
        insight: 'Not reviewed yet',
        is_unset: true,
      },
    }));

    const projectItems = whiteLabelProjects.map(project => ({
      id: `project:${project.id}`,
      scope_type: 'project',
      scope_id: project.id,
      name: project.name,
      subtitle: project.clients?.name ? `White label · ${project.clients.name}` : 'White label project',
      searchText: `${project.name} ${project.clients?.name || ''} white label project`,
      health: projectHealthMap[project.id] || {
        ...createEmptyHealth('project', project.id),
        insight: 'Not reviewed yet',
        is_unset: true,
      },
    }));

    setItems([...directItems, ...projectItems]);
    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        if (filter === 'direct' && item.scope_type !== 'client') return false;
        if (filter === 'white_label' && item.scope_type !== 'project') return false;
        if (filter === 'needs_attention' && (item.health.is_unset || getHealthBucket(item.health.current_state) !== 'needs_attention')) return false;
        if (['fragile', 'stable', 'great'].includes(filter) && (item.health.is_unset || getHealthBucket(item.health.current_state) !== filter)) return false;
        if (search && !item.searchText.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const order = { needs_attention: 0, fragile: 1, stable: 2, great: 3, unset: 4 };
        const aBucket = getHealthBucket(a.health.current_state);
        const bBucket = getHealthBucket(b.health.current_state);
        const aRank = a.health.is_unset ? order.unset : order[aBucket];
        const bRank = b.health.is_unset ? order.unset : order[bBucket];
        if (aRank !== bRank) return aRank - bRank;
        return a.name.localeCompare(b.name);
      });
  }, [filter, items, search]);

  const overview = useMemo(() => {
    const counts = { needs_attention: 0, fragile: 0, stable: 0, great: 0 };
    items.forEach(item => {
      if (item.health.is_unset) return;
      counts[getHealthBucket(item.health.current_state)] += 1;
    });
    return counts;
  }, [items]);

  const topNeedsAttention = useMemo(() => {
    return items.filter(item => !item.health.is_unset && ['needs_attention', 'fragile'].includes(getHealthBucket(item.health.current_state))).slice(0, 4);
  }, [items]);

  const featuredItems = useMemo(() => {
    if (filter === 'all') return topNeedsAttention;
    return filteredItems.filter(item => !item.health.is_unset).slice(0, 4);
  }, [filter, filteredItems, topNeedsAttention]);

  const overviewInsights = useMemo(() => {
    const reviewedItems = items.filter(item => !item.health.is_unset);
    const communicationRisk = reviewedItems.filter(item => item.health.insight === 'Communication risk').length;
    const resultsWeak = reviewedItems.filter(item => item.health.insight === 'Results need improvement').length;
    const futureRisk = reviewedItems.filter(item => item.health.insight === 'Future confidence is slipping').length;
    const healthyButWeak = items.filter(item =>
      !item.health.is_unset &&
      ['stable', 'great'].includes(getHealthBucket(item.health.current_state)) &&
      ['weak', 'mixed'].includes(item.health.actual_results)
    ).length;
    const notReviewed = items.filter(item => item.health.is_unset).length;

    return [
      notReviewed > 0 ? { icon: Layers3, title: `${notReviewed} not reviewed yet`, body: 'These relationships have no managerial pulse yet, so the overview is still incomplete.' } : null,
      communicationRisk > 0 ? { icon: AlertTriangle, title: `${communicationRisk} communication risk`, body: 'These relationships feel shaky even though delivery may still be moving.' } : null,
      resultsWeak > 0 ? { icon: Layers3, title: `${resultsWeak} results issue`, body: 'Relationships look workable, but results need stronger execution.' } : null,
      futureRisk > 0 ? { icon: Sparkles, title: `${futureRisk} future confidence warning`, body: 'Present is manageable, but confidence for the next stretch is weak.' } : null,
      healthyButWeak > 0 ? { icon: ShieldCheck, title: `${healthyButWeak} healthy but underperforming`, body: 'Goodwill still exists, so these are recoverable with better outcomes.' } : null,
    ].filter(Boolean);
  }, [items]);

  const activeFilterLabel = useMemo(() => {
    const filterLabels = {
      all: 'All relationships',
      needs_attention: 'Needs attention',
      fragile: 'Fragile',
      stable: 'Stable',
      great: 'Great',
      direct: 'Direct clients',
      white_label: 'White label',
    };
    return filterLabels[filter] || 'All relationships';
  }, [filter]);

  const dominantFocusArea = useMemo(() => {
    const counts = {};
    const source = featuredItems.length ? featuredItems : filteredItems;
    source.forEach(item => {
      if (!item.health?.focus_area) return;
      counts[item.health.focus_area] = (counts[item.health.focus_area] || 0) + 1;
    });
    const [topKey] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    return topKey || '';
  }, [featuredItems, filteredItems]);

  const actionSummary = useMemo(() => {
    const config = {
      all: {
        title: 'Start here',
        body: topNeedsAttention.length
          ? 'Begin with the relationships that already feel risky, then move outward.'
          : 'Nothing feels urgent right now. Use this page to keep the healthiest accounts healthy.',
      },
      needs_attention: {
        title: 'Immediate action',
        body: 'These accounts need direct attention now. Reach out, reset expectations, or unblock delivery quickly.',
      },
      fragile: {
        title: 'Watch closely',
        body: 'These are not in crisis yet, but they can drift fast if communication slips.',
      },
      stable: {
        title: 'Protect the rhythm',
        body: 'These accounts are fine now. Keep a steady follow-up rhythm and do not let small issues pile up.',
      },
      great: {
        title: 'Protect and appreciate',
        body: 'These are your strongest relationships. Keep momentum high and notice the people helping them stay healthy.',
      },
      direct: {
        title: 'Direct client pulse',
        body: 'This view isolates the relationships you own directly, so it is easier to decide where to step in.',
      },
      white_label: {
        title: 'White label pulse',
        body: 'This view isolates partner-led work where project-level feeling matters more than client-level feeling.',
      },
    };
    return config[filter] || config.all;
  }, [filter, topNeedsAttention.length]);

  const suggestedFocus = useMemo(() => {
    if (!dominantFocusArea) return 'Capture a few updates first so the page can suggest a sharper focus.';
    return `Most of what you are seeing here points to ${getHealthLabel('focus_area', dominantFocusArea).toLowerCase()}.`;
  }, [dominantFocusArea]);

  function openSheet(item) {
    setSheetEntity(item);
    setSheetOpen(true);
  }

  async function handleSave(healthPayload) {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const previous = sheetEntity?.health || null;
    const { data, error } = await saveHealthRecord(healthPayload, userId, previous?.id ? previous : null);
    setSaving(false);

    if (error) {
      alert(`Client Health could not be saved yet: ${error.message || 'Run the SQL migration first.'}`);
      return;
    }

    setItems(prev => prev.map(item => (
      item.id === sheetEntity.id
        ? { ...item, health: data || { ...healthPayload, updated_at: new Date().toISOString() } }
        : item
    )));
    setSheetOpen(false);
  }

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <HeartPulse className="w-12 h-12 text-ios-label4" />
        <p className="text-title3 font-bold text-ios-primary">Client Health — Manager & Admin only</p>
        <p className="text-subhead text-ios-secondary">This view is meant for management visibility.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-title2 font-bold text-ios-primary">Client Health</h1>
          <p className="text-subhead text-ios-secondary">A calm overview of how relationships feel, where risk lives, and where attention matters most.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {HEALTH_BUCKETS.map(bucket => (
          <OverviewTile
            key={bucket.key}
            bucket={bucket}
            count={overview[bucket.key]}
            tone={getHealthTone(
              bucket.key === 'needs_attention' ? 'poor' :
              bucket.key === 'fragile' ? 'fragile' :
              bucket.key === 'great' ? 'excellent' :
              'good'
            )}
            active={filter === bucket.key}
            onClick={() => setFilter(current => current === bucket.key ? 'all' : bucket.key)}
          />
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.15fr,0.85fr] gap-4">
        <div className={`card p-5 border ${getActionTone(filter)}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-caption1 uppercase tracking-wide font-semibold text-ios-secondary">What to do now</p>
              <p className="text-title3 font-bold text-ios-primary mt-1">{actionSummary.title}</p>
              <p className="text-subhead text-ios-secondary mt-2 max-w-2xl">{actionSummary.body}</p>
            </div>
            <div className="shrink-0 rounded-[20px] bg-white/90 border border-ios-separator/40 w-14 h-14 flex items-center justify-center text-2xl shadow-ios-sm">
              {filter === 'needs_attention' ? '🚨' : filter === 'fragile' ? '🫨' : filter === 'great' ? '🌟' : filter === 'stable' ? '🤝' : '🧭'}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="rounded-ios-xl bg-white/85 border border-ios-separator/40 px-4 py-3">
              <p className="text-caption1 uppercase tracking-wide font-semibold text-ios-secondary">Visible first</p>
              <p className="text-subhead font-semibold text-ios-primary mt-1">{featuredItems.length} relationship{featuredItems.length === 1 ? '' : 's'}</p>
              <p className="text-footnote text-ios-secondary mt-1">
                {filter === 'great' ? 'Your strongest accounts are now pinned first.' : 'The most important accounts for this view are now pinned first.'}
              </p>
            </div>
            <div className="rounded-ios-xl bg-white/85 border border-ios-separator/40 px-4 py-3">
              <p className="text-caption1 uppercase tracking-wide font-semibold text-ios-secondary">Suggested focus</p>
              <p className="text-footnote font-semibold text-ios-primary mt-1">{suggestedFocus}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-headline font-semibold text-ios-primary">Quick signals</p>
          <div className="space-y-3 mt-4">
            {overviewInsights.length === 0 ? (
              <div className="rounded-ios-xl bg-ios-fill/60 px-4 py-8 text-center text-ios-secondary text-footnote">
                Add a few health entries and the patterns will start to show up here.
              </div>
            ) : overviewInsights.slice(0, 3).map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={`${item.title}-${index}`} className="rounded-ios-xl border border-ios-separator/40 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-ios bg-ios-fill flex items-center justify-center">
                      <Icon className="w-4 h-4 text-ios-blue" />
                    </div>
                    <p className="text-subhead font-semibold text-ios-primary">{item.title}</p>
                  </div>
                  <p className="text-footnote text-ios-secondary leading-6">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ['all', 'All'],
            ['direct', 'Direct clients'],
            ['white_label', 'White label'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`px-3 py-2 rounded-ios text-footnote font-semibold transition-all ${
                filter === value ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-secondary'
              }`}
            >
              {label}
            </button>
          ))}
          <input
            className="input ml-auto min-w-[240px]"
            placeholder="Search relationships..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="rounded-ios-xl bg-ios-fill/60 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-caption1 uppercase tracking-wide font-semibold text-ios-secondary">Now showing</p>
            <p className="text-subhead font-semibold text-ios-primary">{activeFilterLabel}</p>
          </div>
          <p className="text-footnote text-ios-secondary">
            Tap the mood tiles above to instantly isolate one state.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr,0.9fr] gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-headline font-semibold text-ios-primary">
                {filter === 'great' ? 'Best relationships right now' :
                 filter === 'stable' ? 'Stable relationships worth protecting' :
                 filter === 'fragile' ? 'Fragile relationships to watch closely' :
                 filter === 'needs_attention' ? 'Needs attention now' :
                 filter === 'direct' ? 'Direct clients to look at first' :
                 filter === 'white_label' ? 'White label projects to look at first' :
                 'Needs attention now'}
              </p>
              <p className="text-footnote text-ios-secondary">
                {filter === 'great'
                  ? 'These are the strongest accounts in the current view.'
                  : 'The first relationships to look at in this view.'}
              </p>
            </div>
          </div>
          {featuredItems.length === 0 ? (
            <div className="rounded-ios-xl bg-ios-fill/60 px-4 py-8 text-center text-ios-secondary text-footnote">
              No relationships match this view yet.
            </div>
          ) : (
            <div className="space-y-3">
              {featuredItems.map(item => (
                <ClientHealthSummaryCard
                  key={item.id}
                  title={item.name}
                  subtitle={item.subtitle}
                  health={item.health}
                  compact
                  onClick={() => openSheet(item)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <p className="text-headline font-semibold text-ios-primary mb-4">Why this matters</p>
          <div className="space-y-3">
            {overviewInsights.length === 0 ? (
              <div className="rounded-ios-xl bg-ios-fill/60 px-4 py-8 text-center text-ios-secondary text-footnote">
                Add a few health entries and the patterns will start to show up here.
              </div>
            ) : overviewInsights.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={`${item.title}-${index}`} className="rounded-ios-xl border border-ios-separator/40 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-ios bg-ios-fill flex items-center justify-center">
                      <Icon className="w-4 h-4 text-ios-blue" />
                    </div>
                    <p className="text-subhead font-semibold text-ios-primary">{item.title}</p>
                  </div>
                  <p className="text-footnote text-ios-secondary leading-6">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-headline font-semibold text-ios-primary">{activeFilterLabel}</p>
          <p className="text-footnote text-ios-secondary">Direct clients and white label projects, with the clearest pulse first.</p>
        </div>
        {loading ? (
          <div className="card p-8 text-center text-ios-secondary text-footnote">Loading Client Health...</div>
        ) : filteredItems.length === 0 ? (
          <div className="card p-8 text-center text-ios-secondary text-footnote">No relationships match the current filters.</div>
        ) : (
          <div className="grid xl:grid-cols-2 gap-4">
            {filteredItems.map(item => (
              <ClientHealthSummaryCard
                key={item.id}
                title={item.name}
                subtitle={item.subtitle}
                health={item.health}
                onClick={() => openSheet(item)}
              />
            ))}
          </div>
        )}
      </div>

      <ClientHealthSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        entityLabel={sheetEntity ? `${sheetEntity.name} · ${sheetEntity.subtitle}` : ''}
        scopeType={sheetEntity?.scope_type || 'client'}
        scopeId={sheetEntity?.scope_id || ''}
        initialHealth={sheetEntity?.health || null}
        loading={saving}
      />
    </div>
  );
}
