# Polyverse

Don't just predict the future, simulate it.

A prediction market simulation engine that analyzes how market outcomes ripple through interconnected markets on Polymarket. Built with real-time data, historical correlations, and intelligent relationship detection.

## What It Does

Polyverse simulates how prediction market outcomes affect other markets in the ecosystem. Select any market on Polymarket, choose an outcome, and watch the system trace relationships through connected markets using historical price correlations and pattern recognition.

The interface is straightforward: search for any market, select an outcome, click simulate. The engine analyzes historical price movements, identifies correlated markets, validates relationships with statistical significance, and generates a visual graph showing the network of effects.

What makes this useful is the multi-layer analysis. When you simulate an outcome, the system doesn't just find first-order effects. It propagates through multiple layers (configurable depth) to reveal second and third-order consequences. Select "Bitcoin reaches $150k" and the system traces impacts through crypto markets, Fed policy predictions, tech stocks, and geopolitical events.

The system operates on real data, which means:

- **Historical correlation analysis** using actual Polymarket price history
- **Statistical validation** with correlation coefficients and confidence scoring
- **Multi-layer propagation** with automatic depth limiting
- **Real-time market data** with hourly database synchronization
- **Intelligent filtering** to surface only statistically significant relationships

## How It Works

The simulation runs through a structured pipeline:

### 1. Market Data Pipeline

When the application starts, it initiates a background sync with Polymarket's API:

- Fetches all active markets (currently ~14,000 markets)
- Filters out resolved markets (probabilities <1% or >99%)
- Stores in PostgreSQL with full-text search indexing
- Updates hourly to capture new markets

The database schema indexes on question text, volume, and activity status for fast querying.

### 2. Relationship Discovery

When you run a simulation, the engine:

**Filters by volume**: Only considers markets with $100k+ volume to ensure liquidity

**Keyword extraction**: Identifies meaningful entities and concepts from the trigger question using natural language processing

**Pattern matching**: Uses whole-word regex matching to find semantically related markets (e.g., "OpenAI" matches "OpenAI CEO" but not "Ukraine")

**Sampling**: Takes top 100 related markets by volume for analysis

This gives us a focused set of potentially related markets rather than analyzing all 14k randomly.

### 3. Statistical Validation

For each potential relationship:

**Price history retrieval**: Fetches 1-week interval data (60 fidelity) from Polymarket's CLOB API

**Time series alignment**: Synchronizes price series by timestamp for accurate correlation

**Pearson correlation**: Calculates correlation coefficient between trigger and target market

**Significance filtering**: Only accepts relationships where |correlation| ≥ 0.20 and confidence ≥ 0.5

**Impact magnitude**: Estimates expected price movement using `correlation × trigger_shock × 0.5`

This ensures we only surface relationships backed by actual historical data.

### 4. Multi-Layer Propagation

The engine builds the graph layer by layer:

**Layer 1**: Direct effects on trigger market (max 3 nodes)
**Layer 2**: Effects from Layer 1 markets (max 2 nodes each)  
**Layer 3**: Effects from Layer 2 markets (max 1 node each)

Each layer validates relationships using the same statistical process. This creates a pyramid structure showing how effects cascade through the market ecosystem.

### 5. Direction & Magnitude

For each validated relationship:

**Direction**: Determined by semantic understanding of the relationship
**Magnitude**: Calculated from correlation strength and trigger probability shift
**Confidence bounds**: ±30% range to show uncertainty

The system uses correlation magnitude for impact size, but relies on semantic analysis for direction (increase vs decrease) since correlation sign doesn't always match expected behavior.

## Architecture

### Tech Stack

- **Next.js 16** (React framework with Turbopack)
- **TypeScript** for type safety
- **Supabase/PostgreSQL** for market database and full-text search
- **Groq** for fast LLM inference (used selectively)
- **React Flow** for interactive graph visualization
- **Tailwind CSS** with custom Polymarket color scheme

### Project Structure

```
polyverse-app/
├── app/
│   ├── api/
│   │   ├── markets-db/       # Database operations
│   │   │   ├── sync/          # Hourly market sync from Polymarket
│   │   │   ├── search/        # Full-text market search
│   │   │   └── all/           # Bulk market retrieval
│   │   ├── polymarket/        # Polymarket API proxies
│   │   │   └── markets/       # Market search endpoint
│   │   └── simulation/
│   │       └── run/           # Simulation execution endpoint
│   ├── simulation/[id]/       # Simulation viewer page
│   ├── page.tsx               # Dashboard homepage
│   └── layout.tsx             # Root layout
├── components/
│   ├── causal-graph.tsx       # React Flow graph visualization
│   ├── polymarket-node.tsx    # Custom node component
│   ├── analytics-panel.tsx    # Sidebar with market details
│   └── polyverse-loading.tsx  # Loading animation
├── lib/
│   ├── ai/
│   │   └── openai.ts          # LLM utilities for keyword extraction
│   ├── polymarket/
│   │   ├── client.ts          # Polymarket API client
│   │   ├── price-history.ts   # Historical price data fetching
│   │   └── correlations.ts    # Statistical correlation algorithms
│   └── simulation/
│       └── causal-engine-simple.ts  # Core simulation engine
└── types/
    ├── polymarket.ts          # Market data interfaces
    └── simulation.ts          # Simulation result types
```

### Polymarket API Integration

The application integrates with multiple Polymarket APIs:

#### Gamma API (`gamma-api.polymarket.com`)

**Purpose**: Primary source for market data

**Endpoints Used**:
- `GET /markets` - Bulk market fetching with pagination
  - Params: `limit`, `offset`, `closed`, `active`
  - Fetches up to 500 markets per request
  - Used for hourly database synchronization

**Rate Limiting**: 50ms delay between requests to avoid 429 errors

**Data Transformation**: Parses JSON-stringified `outcomes` and `outcomePrices` fields

#### CLOB API (`clob.polymarket.com`)

**Purpose**: Historical price data for correlation analysis

**Endpoint Used**:
- `GET /prices-history` - Time series price data
  - Params: `market` (token ID), `interval` (1w), `fidelity` (60)
  - Returns array of `{t: timestamp, p: price}` objects
  - Used for calculating statistical correlations

**Token ID Extraction**: Parses `clobTokenIds` JSON array, uses first valid ID

**Time Alignment**: Synchronizes timestamps between different market price series

### Database Schema

PostgreSQL tables in Supabase:

```sql
markets (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  outcomes JSONB,
  outcome_prices JSONB,
  volume DECIMAL,
  liquidity DECIMAL,
  category TEXT,
  image TEXT,
  slug TEXT,
  -- Full-text search index on question
  -- Volume index for sorting
)

market_sync_log (
  last_synced_at TIMESTAMP,
  markets_synced INTEGER
)
```

**Indexes**:
- GIN index on `to_tsvector('english', question)` for fast search
- B-tree index on `volume DESC` for trending markets
- Partial index on `active = true` for filtered queries

### Statistical Methods

#### Correlation Calculation

```typescript
Pearson correlation coefficient:
r = Σ((x - x̄)(y - ȳ)) / √(Σ(x - x̄)² × Σ(y - ȳ)²)

Where:
- x = trigger market prices
- y = target market prices
- x̄, ȳ = means
```

**Acceptance Criteria**:
- |r| ≥ 0.20 (minimum correlation strength)
- Confidence ≥ 0.5 (combined metric)
- Minimum 10 aligned price points

#### Impact Magnitude

```
Expected change = |correlation| × trigger_shock × 0.5

Where:
- trigger_shock = 1.0 - current_probability
- 0.5 = dampening factor for conservative estimates
```

**Bounds**:
- Predicted probability clamped to [0.01, 0.99]
- Confidence ranges: ±30% around point estimate

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase recommended)
- Groq API key for LLM features

### Installation

```bash
git clone <repository-url>
cd polyverse-app
npm install
```

### Environment Configuration

Create `.env.local`:

```bash
# Required
GROQ_API_KEY=your_groq_key_here
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

### Database Setup

Run this SQL in Supabase:

```sql
CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  description TEXT,
  outcomes JSONB,
  outcome_prices JSONB,
  volume DECIMAL,
  liquidity DECIMAL,
  end_date TIMESTAMP,
  active BOOLEAN DEFAULT true,
  closed BOOLEAN DEFAULT false,
  category TEXT,
  tags JSONB,
  image TEXT,
  clob_token_ids TEXT,
  slug TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE market_sync_log (
  id SERIAL PRIMARY KEY,
  last_synced_at TIMESTAMP NOT NULL,
  markets_synced INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_markets_question ON markets 
  USING gin(to_tsvector('english', question));
CREATE INDEX idx_markets_volume ON markets(volume DESC);
CREATE INDEX idx_markets_active ON markets(active) WHERE active = true;
```

### Initial Market Sync

Populate the database:

```bash
# Start dev server
npm run dev

# Trigger initial sync (in browser)
http://localhost:3000/api/markets-db/sync?force=true
```

This fetches ~14,000 active markets from Polymarket (~30 seconds).

### Development

```bash
npm run dev
```

Open `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

## Usage

1. **Search**: Type any market name (min 3 chars) or browse trending markets
2. **Select Outcome**: Choose which outcome to simulate (Yes/No or custom)
3. **Simulate**: Click "Simulate" to run the analysis
4. **Explore**: Click nodes to see detailed statistics and explanations
5. **Navigate**: View historical correlations and relationship strengths

The graph visualization shows:
- **Blue borders**: Trigger market (your selection)
- **Green borders**: Markets predicted to increase
- **Red borders**: Markets predicted to decrease
- **Blue edges**: Relationship strength (opacity indicates confidence)

## Core Algorithms

### Correlation Analysis

The engine uses Pearson correlation on aligned price time series:

1. Fetch 1-week interval price data for both markets
2. Align timestamps (handles missing data points)
3. Calculate correlation coefficient
4. Validate statistical significance (min 10 points, |r| ≥ 0.20)

### Keyword Matching

Multi-stage filtering to find related markets:

1. **LLM extraction**: Identifies 3-7 key entities/concepts from question
2. **Regex matching**: Whole-word boundaries to avoid false positives
3. **Volume sorting**: Prioritizes high-liquidity markets
4. **Fallback**: Top 100 by volume if no keyword matches found

### Graph Layout

Automatic hierarchical layout using Dagre algorithm:

- **Top-down flow**: Trigger at top, effects cascade downward
- **Compact spacing**: 40px horizontal, 120px vertical separation
- **Force-directed**: Minimizes edge crossings
- **Responsive**: Auto-fits viewport with zoom/pan

## Performance Optimizations

### Database Caching

- **Single source of truth**: All users share one PostgreSQL database
- **Hourly updates**: Background sync job fetches new markets
- **Instant search**: GIN indexes enable sub-100ms full-text search
- **No per-user overhead**: Eliminates client-side caching complexity

### Efficient Fetching

- **Batch processing**: Fetches 500 markets per request
- **Pagination**: Handles 50k+ markets without memory issues
- **Rate limiting**: 50ms delays prevent API throttling
- **Parallel validation**: Correlation checks run concurrently

### Client Optimization

- **Debounced search**: 500ms delay reduces unnecessary API calls
- **Lazy rendering**: Only loads visible graph nodes
- **Memoized layouts**: Caches Dagre calculations
- **Optimized images**: WebP format with responsive sizing

## Deployment

### Environment Variables

Production requires:

```bash
GROQ_API_KEY=                    # Required for LLM features
NEXT_PUBLIC_SUPABASE_URL=        # Required for database
SUPABASE_SERVICE_KEY=            # Required for server-side queries
PORT=3000                         # Optional, defaults to 3000
```

### Scheduled Jobs

Set up a cron job to keep markets fresh:

```bash
# Every hour
0 * * * * curl https://your-domain.com/api/markets-db/sync
```

Or use Vercel Cron:

```json
{
  "crons": [{
    "path": "/api/markets-db/sync",
    "schedule": "0 * * * *"
  }]
}
```

### Performance Targets

- **Search latency**: <100ms (database indexed)
- **Simulation time**: 10-20s (depends on graph depth)
- **Initial sync**: ~30s for 14k markets
- **Memory usage**: <512MB server-side
- **Database size**: ~50MB for full market dataset

## Technical Details

### Simulation Parameters

Configurable in `causal-engine-simple.ts`:

```typescript
MAX_DEPTH = 3              // Maximum relationship layers
MIN_CORRELATION = 0.20     // Correlation threshold
MIN_CONFIDENCE = 0.5       // Combined confidence minimum
VOLUME_THRESHOLD = 100000  // Minimum market volume ($100k)
```

Layer limits (pyramid structure):
- Layer 1: Max 3 nodes
- Layer 2: Max 2 nodes per parent
- Layer 3: Max 1 node per parent

### Data Flow

```
User selects market → 
  ↓
Server fetches all markets from DB (instant) →
  ↓
Filter by volume ($100k+) →
  ↓
Extract keywords & find related markets →
  ↓
For each potential relationship:
  - Fetch price history for both markets
  - Calculate Pearson correlation
  - Validate statistical significance
  - Estimate impact magnitude
  ↓
Build graph with validated relationships →
  ↓
Return to client for visualization
```

### LLM Integration

LLMs are used selectively for:

1. **Keyword extraction** - Identifying meaningful terms from market questions
2. **Relationship reasoning** - Generating human-readable explanations

The core logic (correlation analysis, validation, propagation) is algorithmic. LLMs enhance but don't replace the statistical foundation.

## API Reference

### POST /api/simulation/run

Executes a market simulation.

**Request**:
```json
{
  "marketId": "516864",
  "outcome": "Yes"
}
```

**Response**:
```json
{
  "success": true,
  "simulationId": "sim_1234567890",
  "scenario": {
    "nodes": [...],  // Market nodes with predictions
    "edges": [...],  // Relationship links
    "metadata": {
      "totalMarketsAffected": 9,
      "avgProbabilityShift": 0.145,
      "confidenceScore": 75.2
    }
  }
}
```

### GET /api/markets-db/search?q={query}

Searches markets by full-text query.

**Parameters**:
- `q` - Search query (min 3 characters)

**Response**: Array of market objects with question, outcomes, prices, volume, image

### GET /api/markets-db/sync

Synchronizes market database with Polymarket.

**Parameters**:
- `force=true` - Optional, bypasses 1-hour cooldown

**Response**:
```json
{
  "success": true,
  "marketsSynced": 13900,
  "timestamp": "2025-11-16T01:20:03.260Z"
}
```

## Design System

### Color Palette

Following Polymarket's visual identity:

- **Background**: `#1d2b3a` (dark blue)
- **Cards**: `#304254` (grey-blue)  
- **Accent**: `#56afe2` (light blue)
- **Borders**: `#3d4f61` (medium grey-blue)

### Typography

- **Font**: Open Sauce One (custom)
- **Fallback**: System monospace stack
- **Sizes**: Responsive from 12px (mobile) to 40px (desktop headers)

### Components

- **Graph nodes**: Custom Polymarket-style cards with live data
- **Search overlay**: Bottom-positioned with trending markets
- **Analytics panel**: Left sidebar with detailed statistics
- **Loading states**: Animated progress bar with smooth transitions

## Development

### Adding New Features

**Market filters**: Edit `lib/polymarket/client.ts` → `getTrendingMarkets()`

**Graph styling**: Modify `components/polymarket-node.tsx`

**Correlation logic**: Update `lib/polymarket/correlations.ts`

**Validation rules**: Adjust thresholds in `lib/simulation/causal-engine-simple.ts`

### Testing Simulations

Recommended test markets:

- High-volume crypto markets (Bitcoin, Ethereum targets)
- Fed rate decisions (strong correlations)
- Election markets (political chain reactions)
- Tech company valuations (sector correlations)

## License

MIT License - See LICENSE file for details

---

**Built for analyzing prediction market dynamics with statistical rigor.**
