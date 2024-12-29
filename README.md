# GeminiCoder

Turn your ideas into code using AI. Powered by Google's Gemini API and Groq API.

## Features

- Generate code from natural language descriptions
- Support for both Gemini and Groq AI providers
- Real-time code generation with streaming responses
- Built-in code editor with syntax highlighting
- Optional shadcn/ui components integration

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file with the following:
```bash
GOOGLE_AI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

- Get your Gemini API key from [Google AI Studio](https://ai.google.dev/)
- Get your Groq API key from [Groq Console](https://console.groq.com/)

4. Run the development server:
```bash
npm run dev
```

## Usage

1. Select your preferred AI provider (Gemini or Groq)
2. Choose a model:
   - For Gemini: gemini-2.0-flash-exp, gemini-1.5-pro, or gemini-1.5-flash
   - For Groq: mixtral-8x7b-32768
3. Optionally enable shadcn/ui integration
4. Enter your code generation prompt
5. Watch as your code is generated in real-time

## Technologies

- Next.js 15
- TypeScript
- Tailwind CSS
- Radix UI
- Google Gemini API
- Groq API
- shadcn/ui (optional)

## License

MIT