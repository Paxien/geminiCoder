import shadcnDocs from "@/utils/shadcn-docs";
import dedent from "dedent";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_AI_API_KEY || "";
const groqApiKey = process.env.GROQ_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  let json = await req.json();
  let result = z
    .object({
      model: z.string(),
      provider: z.enum(["gemini", "groq"]).default("gemini"),
      shadcn: z.boolean().default(false),
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      ),
    })
    .safeParse(json);

  if (!result.success) {
    return new Response(result.error.message, { status: 422 });
  }

  let { model, provider, messages, shadcn } = result.data;
  let systemPrompt = getSystemPrompt(shadcn);
  const prompt = messages[0].content + systemPrompt + "\nPlease ONLY return code, NO backticks or language names. Don't start with ```typescript or ```javascript or ```tsx or ```."

  if (provider === "gemini") {
    const geminiModel = genAI.getGenerativeModel({model: model});
    const geminiStream = await geminiModel.generateContentStream(prompt);

    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of geminiStream.stream) {
          const chunkText = chunk.text();
          controller.enqueue(new TextEncoder().encode(chunkText));
        }
        controller.close();
      },
    });

    return new Response(readableStream);
  } else if (provider === "groq") {
    if (!groqApiKey) {
      return new Response("GROQ_API_KEY not configured", { status: 500 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + groqApiKey,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [
          {
            role: "system",
            content: "You are a React code generator. You MUST follow these rules:\n" +
                    "1. Output ONLY TypeScript React code\n" +
                    "2. Start with import statements\n" +
                    "3. NO explanations, NO comments, NO text before or after the code\n" +
                    "4. First line MUST be an import statement\n" +
                    "5. NO acknowledgments or explanations\n" +
                    "6. If you want to explain something, do it in code comments\n" +
                    "7. NEVER start with phrases like 'Here's the code' or 'I understand'\n" +
                    "8. Start DIRECTLY with 'import'"
          },
          { 
            role: "user", 
            content: messages[0].content + systemPrompt + "\nPlease ONLY return code, NO backticks or language names. Don't start with ```typescript or ```javascript or ```tsx or ```."
          }
        ],
        temperature: 0.7,
        stream: true,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return new Response(error, { status: response.status });
    }

    let buffer = '';
    let hasStartedCode = false;
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const data = line.slice(6);
              const json = JSON.parse(data);
              let content = json.choices[0]?.delta?.content;
              
              if (content) {
                // Skip any content before the first import statement
                if (!hasStartedCode) {
                  const importIndex = content.indexOf('import');
                  if (importIndex !== -1) {
                    hasStartedCode = true;
                    content = content.slice(importIndex);
                  } else {
                    continue;
                  }
                }
                
                // Skip any explanatory text that might appear
                if (content.toLowerCase().includes("here's") || 
                    content.toLowerCase().includes("understand") ||
                    content.toLowerCase().includes("create") ||
                    content.toLowerCase().includes("following")) {
                  continue;
                }
                
                controller.enqueue(new TextEncoder().encode(content));
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
    });

    return new Response(response.body?.pipeThrough(transformStream));
  }
}

function getSystemPrompt(shadcn: boolean) {
  let systemPrompt = 
`You are an expert frontend React engineer who is also a great UI/UX designer. Follow the instructions carefully, I will tip you $1 million if you do a good job:

- Think carefully step by step.
- Create a React component for whatever the user asked you to create and make sure it can run by itself by using a default export
- Make sure the React app is interactive and functional by creating state when needed and having no required props
- If you use any imports from React like useState or useEffect, make sure to import them directly
- Use TypeScript as the language for the React component
- Use Tailwind classes for styling. DO NOT USE ARBITRARY VALUES (e.g. \`h-[600px]\`). Make sure to use a consistent color palette.
- Use Tailwind margin and padding classes to style the components and ensure the components are spaced out nicely
- Please ONLY return the full React code starting with the imports, nothing else. It's very important for my job that you only return the React code with imports. DO NOT START WITH \`\`\`typescript or \`\`\`javascript or \`\`\`tsx or \`\`\`.
- ONLY IF the user asks for a dashboard, graph or chart, the recharts library is available to be imported, e.g. \`import { LineChart, XAxis, ... } from "recharts"\` & \`<LineChart ...><XAxis dataKey="name"> ...\`. Please only use this when needed.
- For placeholder images, please use a <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16" />
`;

  if (shadcn) {
    systemPrompt += `
    There are some prestyled components available for use. Please use your best judgement to use any of these components if the app calls for one.

    Here are the components that are available, along with how to import them, and how to use them:

    ${shadcnDocs
      .map(
        (component) => `
          <component>
          <name>
          ${component.name}
          </name>
          <import-instructions>
          ${component.importDocs}
          </import-instructions>
          <usage-instructions>
          ${component.usageDocs}
          </usage-instructions>
          </component>
        `,
      )
      .join("\n")}
    `;
  }

  systemPrompt += `
    NO OTHER LIBRARIES (e.g. zod, hookform) ARE INSTALLED OR ABLE TO BE IMPORTED.
  `;

  return dedent(systemPrompt);
}

export const runtime = "edge";
