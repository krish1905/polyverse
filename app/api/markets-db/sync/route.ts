// Background job to sync markets from Polymarket to our DB
import { NextResponse } from "next/server";
import axios from "axios";
import { createClient } from '@supabase/supabase-js';

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';
  
  console.log('[MarketSync] Sync requested...', force ? '(FORCED)' : '');
  
  try {
    const supabase = getSupabase();
    
    // Get the last sync timestamp from DB
    const { data: lastSync } = await supabase
      .from('market_sync_log')
      .select('last_synced_at')
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .single();
    
    const lastSyncTime = lastSync?.last_synced_at ? new Date(lastSync.last_synced_at) : null;
    
    // Only sync if more than 1 hour has passed (unless forced)
    if (lastSyncTime && !force) {
      const hoursSinceSync = (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 1) {
        console.log(`[MarketSync] Skipping - last sync was ${Math.floor(hoursSinceSync * 60)} minutes ago (add ?force=true to override)`);
        return NextResponse.json({
          success: true,
          skipped: true,
          message: 'Sync not needed yet. Add ?force=true to force sync.',
          lastSync: lastSyncTime,
        });
      }
    }
    
    console.log('[MarketSync] Starting fresh sync...');
    
    // Fetch active markets from Polymarket
    let allMarkets: any[] = [];
    let offset = 0;
    const batchSize = 500;
    
    while (offset < 50000) {
      const response = await axios.get(`${GAMMA_API_BASE}/markets`, {
        params: {
          limit: batchSize,
          offset: offset,
          closed: false,
          active: true,
        },
        timeout: 10000,
      });
      
      const batch = Array.isArray(response.data) ? response.data : [];
      if (batch.length === 0) break;
      
      allMarkets = allMarkets.concat(batch);
      offset += batchSize;
      
      if (allMarkets.length % 5000 === 0) {
        console.log(`[MarketSync] Fetched ${allMarkets.length} markets...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Filter out resolved markets
    const activeMarkets = allMarkets.filter((m: any) => {
      const prices = m.outcomePrices;
      if (typeof prices === 'string') {
        try {
          const parsed = JSON.parse(prices);
          const firstPrice = parseFloat(parsed[0] || 0.5);
          return firstPrice > 0.01 && firstPrice < 0.99;
        } catch (e) {
          return true;
        }
      }
      return true;
    });
    
    console.log(`[MarketSync] Got ${activeMarkets.length} active markets`);
    
    // Upsert into DB (insert or update)
    const { error } = await supabase
      .from('markets')
      .upsert(
        activeMarkets.map((m: any) => {
          // Parse outcomes if needed
          let outcomes = m.outcomes;
          if (typeof outcomes === 'string') {
            try {
              outcomes = JSON.parse(outcomes);
            } catch (e) {
              outcomes = ['Yes', 'No'];
            }
          }
          
          // Parse outcome prices if needed
          let outcomePrices = m.outcomePrices;
          if (typeof outcomePrices === 'string') {
            try {
              outcomePrices = JSON.parse(outcomePrices);
              outcomePrices = outcomePrices.map((p: any) => parseFloat(p));
            } catch (e) {
              outcomePrices = [0.5, 0.5];
            }
          }
          
          return {
            id: m.id,
            question: m.question,
            description: m.description,
            outcomes: outcomes,
            outcome_prices: outcomePrices,
            volume: parseFloat(m.volume || 0),
            liquidity: parseFloat(m.liquidity || 0),
            end_date: m.endDate,
            active: m.active !== false,
            closed: m.closed === true,
            category: m.category || m.groupItemTitle || 'Other',
            tags: m.tags || [],
            image: m.image,
            clob_token_ids: m.clobTokenIds,
            slug: m.slug,
            updated_at: new Date().toISOString(),
          };
        }),
        { onConflict: 'id' }
      );
    
    if (error) {
      console.error('[MarketSync] DB upsert error:', error);
      throw error;
    }
    
    // Log sync completion
    await supabase
      .from('market_sync_log')
      .insert({
        last_synced_at: new Date().toISOString(),
        markets_synced: activeMarkets.length,
      });
    
    console.log(`[MarketSync] ✓ Synced ${activeMarkets.length} markets to DB`);
    
    return NextResponse.json({
      success: true,
      marketsSynced: activeMarkets.length,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    console.error('[MarketSync] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

