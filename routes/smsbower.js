const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function pushSms({ key, smsId, phone, phoneFrom, text, call, voice }) {
  const baseUrl = process.env.SMSBOWER_BASE_URL;
  const url = new URL('/agent/api/sms', baseUrl);
  
  const params = new URLSearchParams();
  params.append('key', key);
  params.append('smsId', smsId);
  params.append('phone', phone);
  params.append('phoneFrom', phoneFrom);
  params.append('text', text);
  if (call !== undefined) params.append('call', call ? 1 : 0);
  if (voice !== undefined) params.append('voice', voice ? 1 : 0);

  url.search = params.toString();

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, { method: 'GET' });
      const data = await response.text(); // Assuming plain text or json
      
      if (data.includes('SUCCESS') || response.ok) {
        return { success: true, data };
      }
      
      if (attempt < 5) await wait(10000);
    } catch (err) {
      if (attempt < 5) await wait(10000);
    }
  }
  return { success: false, error: 'Max retries reached' };
}

async function getStatistics(apiKey, countriesIds) {
  const baseUrl = process.env.SMSBOWER_BASE_URL;
  const url = new URL('/api/statistic/simCards', baseUrl);
  url.searchParams.append('api_key', apiKey);
  if (countriesIds && Array.isArray(countriesIds)) {
    countriesIds.forEach(id => url.searchParams.append('countriesIds[]', id));
  }
  const response = await fetch(url);
  return response.json();
}

async function getActivationStatus(apiKey, activationId) {
  const baseUrl = process.env.SMSBOWER_BASE_URL;
  const url = new URL('/agent/api/getStatus', baseUrl);
  url.searchParams.append('api_key', apiKey);
  url.searchParams.append('activationId', activationId);
  const response = await fetch(url);
  return response.json();
}

module.exports = {
  pushSms,
  getStatistics,
  getActivationStatus
};
