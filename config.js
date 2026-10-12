const isFilePage = location.protocol === 'file:';
const apiBase = isFilePage ? 'http://localhost:3000' : '';

window.AI_TEST_HUB_CONFIG = {
  endpoint: apiBase + '/api/chat/completions',
  model: 'GLM-5.2',
  apiKey: '',
  apiBase
};
