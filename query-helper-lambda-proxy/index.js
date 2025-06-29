const aws = require('aws-sdk');
const https = require('https');
const url = require('url');

let cachedApiKey = null;

exports.handler = async (event) => {
  try {
    console.log(`event ${JSON.stringify(event)}`);

    // Retrieve API key from Secrets Manager if not cached
    if (!cachedApiKey) {
      const secretsManager = new aws.SecretsManager();
      const secret = await secretsManager.getSecretValue({ SecretId: 'prod/MongoDBClient/xAI' }).promise();
      cachedApiKey = JSON.parse(secret.SecretString).xAIApiKey;
    }

    // Extract request details from Lambda Function URL event
    const { requestContext = {}, rawPath = '/', rawQueryString = '', headers = {}, body } = event;
    const httpMethod = (requestContext.http?.method || 'GET');

    // Construct xAI API URL
    const apiUrl = `https://api.x.ai${rawPath}${rawQueryString ? '?' + rawQueryString : ''}`;
    console.log(`apiUrl ${apiUrl}`);

    // Parse URL for https request
    const parsedUrl = url.parse(apiUrl);

    // Prepare headers, adding Authorization and Host
    const requestHeaders = {
      ...headers,
      Authorization: `Bearer ${cachedApiKey}`,
      Host: 'api.x.ai'
    };

    // Set up HTTPS request options with TLS configuration
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: httpMethod,
      headers: requestHeaders,
    };
    console.log(`method ${httpMethod}, URL ${JSON.stringify(parsedUrl)}`);
    // console.log(`request ${JSON.stringify(options)}`);

    // Make HTTPS request
    return await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const resp = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          };
          console.log(`response ${JSON.stringify(resp)}`);
          resolve(resp);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      // Write body if present
      if (body) {
        const bodyData = typeof body === 'string' ? body : JSON.stringify(body);
        console.log(`request body ${bodyData}`);
        req.write(bodyData);
      }

      req.end();
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to proxy request', details: error.message })
    };
  }
};
