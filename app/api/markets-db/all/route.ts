// Get all markets from DB
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10000");
  
  try {
    console.log(`[DB] Fetching up to ${limit} markets from database...`);
    
    const { data, error, count } = await supabase
      .from('markets')
      .select('*', { count: 'exact' })
      .eq('active', true)
      .order('volume', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[DB] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log(`[DB] ✓ Returning ${data?.length || 0} markets (total in DB: ${count})`);
    
    // Transform to match PolymarketMarket interface
    const markets = (data || []).map((m: any) => ({
      id: m.id,
      question: m.question,
      description: m.description,
      outcomes: Array.isArray(m.outcomes) ? m.outcomes : (typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : ['Yes', 'No']),
      outcomePrices: Array.isArray(m.outcome_prices) ? m.outcome_prices : (typeof m.outcome_prices === 'string' ? JSON.parse(m.outcome_prices) : [0.5, 0.5]),
      volume: parseFloat(m.volume) || 0,
      liquidity: parseFloat(m.liquidity) || 0,
      endDate: m.end_date,
      active: m.active,
      closed: m.closed,
      category: m.category,
      tags: Array.isArray(m.tags) ? m.tags : (m.tags ? JSON.parse(m.tags) : []),
      image: m.image,
      createdAt: m.created_at,
      clobTokenIds: m.clob_token_ids,
      slug: m.slug,
    }));
    
    return NextResponse.json(markets);
    
  } catch (error: any) {
    console.error('[DB] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

