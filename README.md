# Skillbridge Live

pull code from my github and run the website here , repository name is skillbridge ai

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f435d6c1-2ef5-4031-ab2a-021343a631a1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## AI configuration (server environment variables)

The AI route (`/api/public/ai`) runs on the server and reads these variables. The key is never sent to the browser.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes (or `AI_API_KEY`) | OpenAI API key. Defaults to `https://api.openai.com/v1` and `gpt-4o-mini`. |
| `AI_API_KEY` | Legacy alias | Same as above. A key starting with `sk-` defaults to OpenAI; any other key defaults to Google Gemini. |
| `AI_BASE_URL` | No | Override the chat-completions base URL. |
| `AI_MODEL` | No | Override the model id (`OPENAI_MODEL` also accepted). |

On Vercel: Project → Settings → Environment Variables → add `OPENAI_API_KEY` for Production, then **redeploy** (variables only apply to new deployments).
Use the **Test AI connection** button on the Resume tab to see the exact failure reason.
