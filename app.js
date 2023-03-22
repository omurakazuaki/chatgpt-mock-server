const Koa = require('koa');
const Router = require('koa-router');
const { koaBody } = require('koa-body');
const { Configuration, OpenAIApi } = require('openai');

require('dotenv').config();
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

let swagger = 'Nothing yet';

const history = [];
const router = new Router();
router
  .post('/swagger', async(ctx) => {
    try {
      const SWAGGER_GENERATOR_PROMPT =
`I would like you to generate a Swagger based on the following specifications
I want you to complete the missing specifications.
I WANT YOU TO RETURN ONLY THE SWAGGER YAML INSIDE ONE UNIQUE CODE BLOCK, AND NOTHING ELSE.

# Specification
${ctx.request.body.prompt}

Let's begin.
`;
      const messages = [
        {role: 'user', content: SWAGGER_GENERATOR_PROMPT},
      ];
      console.debug(messages);
      const response =  await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0,
      });
      swagger = response?.data?.choices[0]?.message?.content;
      console.log(swagger);
      ctx.response.body = { completion: swagger };
      ctx.response.status = 200;
    } catch (e) {
      ctx.response.body = e?.response?.data || e;
      ctx.response.status = 500;
    }
  })
  .all('(.*)', async(ctx) => {
    try {
      history.push({role: 'user', content: `${ctx.request.method} ${ctx.request.url} HTTP/1.1\n\n${JSON.stringify(ctx.request.body || '')}`});
      const REST_API_SYSTEM_PROMPT =
`I want you to act as a REST API based on the following Swagger spec.
I want you to prepare the initial data.
I want you to update the data based on the Swagger spec.
I want you to return an error response if there is an issue with a request.
I WANT YOU TO ONLY REPLY WITH THE HTTP RESPONSE, AND NOTHING ELSE.

# Swagger spec
${swagger}

Let's begin.
`;
      const messages = [
        {role: 'system', content: REST_API_SYSTEM_PROMPT},
        ...history,
      ];
      console.debug(messages);
      const response =  await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0,
      });
      const completion = response?.data?.choices[0]?.message?.content;
      console.log(completion)
      const [ headers, body ] = completion.split('\n\n');
      const headerLines = headers.split('\n');
      const [ _, status ] = headerLines.shift().split(' ');
      history.push({role: 'assistant', content: completion});
      ctx.response.body = JSON.parse(body.replace('#.*', '').trim());
      ctx.response.status = Number(status);
    } catch (e) {
      ctx.response.body = e?.response?.data || e;
      ctx.response.status = 500;
    }
  });

const app = new Koa();
app.use(koaBody());
app.use(router.routes());
app.listen(3000);
