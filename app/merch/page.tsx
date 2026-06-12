'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { datadogRum } from '@datadog/browser-rum';
import {
  ShoppingBag, Tag, AlertCircle, CheckCircle2, RefreshCw,
  TrendingUp, Flame, Zap, ArrowUpRight,
} from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';
import { DriverNameGate } from '@/components/DriverNameGate';
import { useUserStore } from '@/store/userStore';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MerchProduct {
  id: string;
  name: string;
  team: string;
  description: string;
  badge: string | null;
  category: string;
  available: boolean;
  price: number;
  base_price: number;
  demand_multiplier: number;
  units_sold_1h: number;
  currency: string;
  pricing_source: string;
  dbt_updated_at: string | null;
}

interface CartItem { product: MerchProduct; quantity: number; }
type CheckoutState = 'idle' | 'processing' | 'success' | 'error';

// ─── Demand tier ──────────────────────────────────────────────────────────────

type DemandTier = 'maxed' | 'hot' | 'trending' | 'rising' | 'base';

function getDemandTier(mult: number): DemandTier {
  if (mult >= 1.45) return 'maxed';
  if (mult >= 1.30) return 'hot';
  if (mult >= 1.15) return 'trending';
  if (mult >= 1.05) return 'rising';
  return 'base';
}

const TIER_CONFIG: Record<DemandTier, {
  label: string;
  labelClass: string;
  cardBorder: string;
  glowStyle: React.CSSProperties;
  badgeBg: string;
  barColor: string;
  icon: React.ReactNode;
}> = {
  maxed: {
    label: 'ON FIRE',
    labelClass: 'text-orange-300',
    cardBorder: 'border-orange-500/60',
    glowStyle: { boxShadow: '0 0 24px 2px rgba(249,115,22,0.18), inset 0 0 0 1px rgba(249,115,22,0.25)' },
    badgeBg: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    barColor: '#f97316',
    icon: <Flame className="h-3.5 w-3.5 text-orange-400" />,
  },
  hot: {
    label: 'HOT',
    labelClass: 'text-amber-300',
    cardBorder: 'border-amber-500/50',
    glowStyle: { boxShadow: '0 0 16px 1px rgba(245,158,11,0.12)' },
    badgeBg: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
    barColor: '#f59e0b',
    icon: <Zap className="h-3.5 w-3.5 text-amber-400" />,
  },
  trending: {
    label: 'TRENDING',
    labelClass: 'text-yellow-300',
    cardBorder: 'border-yellow-500/35',
    glowStyle: {},
    badgeBg: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20',
    barColor: '#eab308',
    icon: <TrendingUp className="h-3.5 w-3.5 text-yellow-400" />,
  },
  rising: {
    label: 'RISING',
    labelClass: 'text-emerald-400',
    cardBorder: 'border-emerald-500/25',
    glowStyle: {},
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    barColor: '#10b981',
    icon: <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />,
  },
  base: {
    label: '',
    labelClass: '',
    cardBorder: 'border-white/10',
    glowStyle: {},
    badgeBg: '',
    barColor: '#6b7280',
    icon: null,
  },
};

// ─── Team colour accents ──────────────────────────────────────────────────────

const TEAM_COLOURS: Record<string, string> = {
  'Red Bark Racing':   'border-[#3671C6]',
  'Mercedes Woof AMG': 'border-[#27F4D2]',
  'Ferrari LeBark':    'border-[#E8002D]',
  'McLaren Nor-ruff':  'border-[#FF8000]',
};
function teamAccent(team: string) { return TEAM_COLOURS[team] ?? 'border-white/20'; }

// ─── Demand heat bar ──────────────────────────────────────────────────────────

function DemandBar({ mult, color }: { mult: number; color: string }) {
  const pct = Math.round(((mult - 1.0) / 0.5) * 100);
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-faint)]">
          Demand heat
        </span>
        <span className="font-mono text-[9px] text-[var(--text-faint)]">{pct}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Freshness banner ─────────────────────────────────────────────────────────

function FreshnessBanner({ source, hours }: { source: string; hours: number | null }) {
  if (source === 'bigquery') return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
      <div>
        <p className="text-sm font-medium text-amber-300">Dynamic pricing unavailable</p>
        <p className="mt-0.5 text-xs text-amber-300/70">
          {hours !== null
            ? `Pricing data is ${hours.toFixed(1)}h stale — the dbt pipeline may have failed. Showing base prices.`
            : 'BigQuery not configured — showing base prices.'}
        </p>
      </div>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  rank,
  onAddToCart,
}: {
  product: MerchProduct;
  rank: number;
  onAddToCart: (p: MerchProduct) => void;
}) {
  const tier   = getDemandTier(product.demand_multiplier);
  const cfg    = TIER_CONFIG[tier];
  const isHot  = tier === 'maxed' || tier === 'hot';
  const pctUp  = product.price > product.base_price
    ? Math.round((product.price - product.base_price) / product.base_price * 100)
    : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, delay: rank * 0.04 }}
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border bg-white/[0.03] p-5 transition-colors duration-300',
        isHot ? cfg.cardBorder : teamAccent(product.team),
        isHot && 'hover:bg-white/[0.07]',
        !isHot && 'hover:bg-white/[0.06]',
      )}
      style={cfg.glowStyle}
    >
      {/* ── Fire pulse ring for maxed items ─────────────────────────── */}
      {tier === 'maxed' && (
        <span className="pointer-events-none absolute inset-0 rounded-2xl">
          <span className="absolute inset-0 animate-ping rounded-2xl border border-orange-500/20" />
        </span>
      )}

      {/* ── Top row: demand tier badge + rank ───────────────────────── */}
      <div className="flex items-center justify-between">
        {tier !== 'base' ? (
          <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest', cfg.badgeBg)}>
            {cfg.icon}
            {cfg.label}
          </span>
        ) : (
          <span className="w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            {product.team}
          </span>
        )}

        {rank <= 2 && (
          <span className="font-mono text-[10px] text-[var(--text-faint)]">
            #{rank + 1} selling
          </span>
        )}
      </div>

      {/* ── Team pill (only when demand tier is showing instead) ─────── */}
      {tier !== 'base' && (
        <span className="w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
          {product.team}
        </span>
      )}

      {/* ── Name + description ──────────────────────────────────────── */}
      <h3 className={cn('text-base font-semibold leading-snug', isHot ? cfg.labelClass : 'text-white')}>
        {product.name}
      </h3>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">{product.description}</p>

      {/* ── Price row ───────────────────────────────────────────────── */}
      <div className="mt-auto flex items-end justify-between pt-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className={cn('text-xl font-bold tabular-nums', isHot ? cfg.labelClass : 'text-white')}>
              ฿{product.price.toLocaleString()}
            </span>
            {pctUp > 0 && (
              <span className={cn('text-[11px] font-semibold', cfg.labelClass)}>
                +{pctUp}%
              </span>
            )}
          </div>
          {pctUp > 0 && (
            <span className="text-xs text-[var(--text-faint)] line-through">
              ฿{product.base_price.toLocaleString()}
            </span>
          )}
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-faint)]">
            {product.units_sold_1h > 0
              ? `${product.units_sold_1h} sold in last hour`
              : product.category}
          </span>
        </div>

        <button
          onClick={() => onAddToCart(product)}
          disabled={!product.available}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-150',
            product.available
              ? isHot
                ? 'border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20'
                : 'border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/10 text-white hover:bg-[color:var(--brand-primary)]/25'
              : 'cursor-not-allowed border-white/10 text-[var(--text-faint)]',
          )}
        >
          {isHot ? <Flame className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
          Add
        </button>
      </div>

      {/* ── Demand heat bar ─────────────────────────────────────────── */}
      {product.demand_multiplier > 1.0 && (
        <DemandBar mult={product.demand_multiplier} color={cfg.barColor} />
      )}
    </motion.div>
  );
}

// ─── Cart panel ───────────────────────────────────────────────────────────────

function CartPanel({
  items, onCheckout, checkoutState, onClear,
}: {
  items: CartItem[];
  onCheckout: () => void;
  checkoutState: CheckoutState;
  onClear: () => void;
}) {
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ShoppingBag className="h-10 w-10 text-[var(--text-faint)]" />
        <p className="text-sm text-[var(--text-muted)]">Your cart is empty</p>
        <p className="text-xs text-[var(--text-faint)]">Add a merch item to get started</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map(({ product, quantity }) => (
        <div key={product.id} className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{product.name}</p>
            <p className="text-xs text-[var(--text-muted)]">{product.team}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="tabular-nums text-white">฿{(product.price * quantity).toLocaleString()}</p>
            <p className="text-xs text-[var(--text-faint)]">×{quantity}</p>
          </div>
        </div>
      ))}

      <div className="border-t border-white/10 pt-3">
        <div className="flex justify-between text-sm font-semibold text-white">
          <span>Total</span>
          <span className="tabular-nums">฿{total.toLocaleString()}</span>
        </div>
      </div>

      {checkoutState === 'error' && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          <div>
            <p className="text-xs font-medium text-red-300">Payment processing failed</p>
            <p className="mt-0.5 text-[10px] text-red-300/60">
              Cannot read properties of null (THBConversionRate)
            </p>
          </div>
        </div>
      )}

      {checkoutState === 'success' && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-medium text-emerald-300">Order confirmed!</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCheckout}
          disabled={checkoutState === 'processing' || checkoutState === 'success'}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all',
            checkoutState === 'processing'
              ? 'cursor-wait border-white/10 bg-white/5 text-[var(--text-muted)]'
              : checkoutState === 'success'
                ? 'cursor-default border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/15 text-white hover:bg-[color:var(--brand-primary)]/30',
          )}
        >
          {checkoutState === 'processing' ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Processing…</>
          ) : checkoutState === 'success' ? (
            <><CheckCircle2 className="h-4 w-4" /> Confirmed</>
          ) : (
            <><Tag className="h-4 w-4" /> Checkout</>
          )}
        </button>
        {checkoutState !== 'success' && (
          <button
            onClick={onClear}
            className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-[var(--text-muted)] hover:bg-white/5 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MerchPage() {
  const { userId, hasSetName } = useUserStore();
  const [products, setProducts]           = useState<MerchProduct[]>([]);
  const [pricingSource, setPricingSource] = useState<string>('loading');
  const [freshnessHours, setFreshnessHours] = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // ── Fetch products ──────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/merch/products', { cache: 'no-store' });
      const data = await res.json();
      setProducts(data.products ?? []);
      setPricingSource(data.pricing_source ?? 'unknown');
      setFreshnessHours(data.freshness_hours ?? null);
      datadogRum.addAction('merch.products_loaded', {
        product_count:  (data.products ?? []).length,
        pricing_source: data.pricing_source,
        freshness_hours: data.freshness_hours,
      });
    } catch {
      setPricingSource('error_fallback');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Add to cart ─────────────────────────────────────────────────────────────
  const handleAddToCart = (product: MerchProduct) => {
    datadogRum.addAction('merch.cart_add', { product_id: product.id, team: product.team, price: product.price });
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
    setCheckoutState('idle');
  };

  // ── Checkout ────────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0 || checkoutState === 'processing') return;
    datadogRum.addAction('merch.checkout_start', {
      item_count: cart.length,
      total_thb:  cart.reduce((s, i) => s + i.product.price * i.quantity, 0),
    });
    setCheckoutState('processing');
    try {
      const firstItem = cart[0];
      const res = await fetch('/api/merch/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: firstItem.product.id,
          quantity:  firstItem.quantity,
          priceThb:  firstItem.product.price,
          team:      firstItem.product.team,
          category:  firstItem.product.category,
          userId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Checkout failed');
      setCheckoutState('success');
      datadogRum.addAction('merch.checkout_success', { product_id: firstItem.product.id });
    } catch (err) {
      setCheckoutState('error');
      datadogRum.addAction('merch.checkout_error', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  // ── Sort by demand desc, then filter by category ────────────────────────────
  const sortedByDemand = [...products].sort((a, b) => b.demand_multiplier - a.demand_multiplier);
  const categories     = ['all', ...Array.from(new Set(products.map(p => p.category)))];
  const filtered       = activeCategory === 'all'
    ? sortedByDemand
    : sortedByDemand.filter(p => p.category === activeCategory);

  const hotCount = filtered.filter(p => getDemandTier(p.demand_multiplier) === 'maxed' || getDemandTier(p.demand_multiplier) === 'hot').length;

  if (!hasSetName) return <DriverNameGate />;

  return (
    <div className="page-shell pb-28 pt-24 md:pb-8 md:pt-28">
      <PageIntro
        eyebrow="Limited Edition"
        title="Paddock"
        accent="Shop"
        summary="Official Box Box Bits AI team merch — F1 dog-pun gear from your favourite paddock characters. Prices update dynamically based on demand."
      />

      <FreshnessBanner source={pricingSource} hours={freshnessHours} />

      {/* ── Controls bar ───────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-all',
                activeCategory === cat
                  ? 'border-[color:var(--border-strong)] bg-[color:var(--brand-primary)]/15 text-white'
                  : 'border-white/10 text-[var(--text-muted)] hover:border-white/20 hover:text-white',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {hotCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1">
              <Flame className="h-3 w-3 text-orange-400" />
              <span className="font-mono text-[10px] font-semibold text-orange-300">
                {hotCount} on fire
              </span>
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <div className={cn('h-2 w-2 rounded-full', pricingSource === 'bigquery' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-faint)]">
              {pricingSource === 'bigquery' ? 'Live pricing' : 'Base pricing'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Product grid sorted by demand ──────────────────────────── */}
        <div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
          ) : (
            <>
              {/* Section label when items have demand data */}
              {pricingSource === 'bigquery' && (
                <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[var(--text-faint)]">
                  Sorted by demand — hottest first
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <AnimatePresence mode="popLayout">
                  {filtered.map((product, idx) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      rank={idx}
                      onAddToCart={handleAddToCart}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        {/* ── Cart panel ─────────────────────────────────────────────── */}
        <div className="surface-panel h-fit rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)
            </span>
          </div>
          <CartPanel
            items={cart}
            onCheckout={handleCheckout}
            checkoutState={checkoutState}
            onClear={() => { setCart([]); setCheckoutState('idle'); }}
          />
        </div>
      </div>
    </div>
  );
}
