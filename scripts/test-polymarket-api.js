// Test script to see actual Polymarket API responses

const axios = require('axios');

async function testPolymarketAPI() {
  console.log('Testing Polymarket Gamma API...\n');
  
  try {
    // Test 1: Events endpoint (recommended for current markets)
    console.log('=== TEST 1: /events endpoint (closed=false) ===');
    const eventsResponse = await axios.get('https://gamma-api.polymarket.com/events', {
      params: {
        limit: 5,
        closed: false,
        order: 'volume',
        ascending: false
      }
    });
    
    console.log(`Found ${eventsResponse.data.length} events\n`);
    
    if (eventsResponse.data.length > 0) {
      const firstEvent = eventsResponse.data[0];
      console.log('First event:');
      console.log(JSON.stringify(firstEvent, null, 2));
      console.log('\n');
    }
    
    // Test 2: Markets endpoint directly
    console.log('=== TEST 2: /markets endpoint ===');
    const marketsResponse = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: {
        limit: 5,
        closed: false
      }
    });
    
    console.log(`Found ${marketsResponse.data.length} markets\n`);
    
    if (marketsResponse.data.length > 0) {
      const firstMarket = marketsResponse.data[0];
      console.log('First market:');
      console.log(JSON.stringify(firstMarket, null, 2));
      console.log('\n');
      
      // Check for price fields
      console.log('Price-related fields in first market:');
      const priceFields = [
        'price', 'prices', 'outcomePrices', 'lastPrice', 
        'bestBid', 'bestAsk', 'clobTokenIds', 'tokens'
      ];
      priceFields.forEach(field => {
        if (firstMarket[field] !== undefined) {
          console.log(`  ${field}:`, firstMarket[field]);
        }
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testPolymarketAPI();

