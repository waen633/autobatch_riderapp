const tencentcloud = require('tencentcloud-sdk-nodejs-cls');
const ClsClient = tencentcloud.cls.v20201016.Client;

let _clsClient = null;
let _clsTopicId = null;

function getClsClient() {
  if (!_clsClient) {
    _clsClient = new ClsClient({
      credential: {
        secretId: process.env.CLS_SECRET_ID,
        secretKey: process.env.CLS_SECRET_KEY,
      },
      region: process.env.CLS_REGION || 'ap-singapore',
    });
  }
  return _clsClient;
}

async function getClsTopicId() {
  if (_clsTopicId) return _clsTopicId;
  if (process.env.CLS_TOPIC_ID) {
    _clsTopicId = process.env.CLS_TOPIC_ID;
    return _clsTopicId;
  }
  const client = getClsClient();
  const res = await client.DescribeTopics({
    Filters: [{ Key: 'topicName', Values: [process.env.CLS_TOPIC_NAME || 'allnow-prod-log'] }],
    Limit: 10,
  });
  const topic = (res.Topics || []).find(t => t.TopicName === (process.env.CLS_TOPIC_NAME || 'allnow-prod-log'));
  if (!topic) throw new Error(`CLS topic "${process.env.CLS_TOPIC_NAME}" not found`);
  _clsTopicId = topic.TopicId;
  return _clsTopicId;
}

// CLS SearchLog caps each call at Limit (max 1000). Page through Context
// until ListOver to get all matching logs, up to maxTotal safety cap.
async function searchLogAll(client, baseParams, maxTotal = 5000) {
  let allResults = [];
  let params = baseParams;
  while (true) {
    const res = await client.SearchLog(params);
    const batch = res.Results || [];
    allResults = allResults.concat(batch);
    if (res.ListOver || !res.Context || batch.length === 0 || allResults.length >= maxTotal) break;
    params = { ...baseParams, Context: res.Context };
  }
  return allResults.slice(0, maxTotal);
}

module.exports = { getClsClient, getClsTopicId, searchLogAll };
