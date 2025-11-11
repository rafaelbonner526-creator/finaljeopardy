# AI Study Tool (v4 Jeopardy + GPT-4o-mini)

This version connects to OpenAI's GPT-4o-mini for grading, with a keyword-based fallback if no API key is set
or if the API call fails.

## Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Create a `.env` file in the `backend` folder with:

```env
OPENAI_API_KEY=sk-your-key-here
```

3. Run the server:

```bash
npm start
```

4. Open http://localhost:4000 in your browser.
