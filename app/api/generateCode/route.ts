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
      model: z.string().optional(),
      provider: z.enum(["gemini", "groq"]).default("gemini"),
      groqModel: z.enum([
        "mixtral-8x7b-32768",
        "llama3-70b-8192",
        "llama3-8b-8192"
      ] as const).optional(),
      shadcn: z.boolean().default(false),
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      ),
    })
    .safeParse(json);

  if (!result.success) {
    return new Response(result.error.message, { status: 422 });
  }

  const { provider, groqModel, messages, shadcn } = result.data;
  let systemPrompt = getSystemPrompt(shadcn);

  if (provider === "gemini") {
    if (!result.data.model) {
      return new Response("Model is required for Gemini", { status: 422 });
    }
    const geminiModel = genAI.getGenerativeModel({ model: result.data.model });
    const geminiStream = await geminiModel.generateContentStream(
      messages[0].content + systemPrompt + "\nPlease ONLY return code, NO backticks or language names. Don't start with \`\`\`typescript or \`\`\`javascript or \`\`\`tsx or \`\`\`."
    );

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of geminiStream.stream) {
              const chunkText = chunk.text();
              controller.enqueue(new TextEncoder().encode(chunkText));
            }
          } catch (error) {
            controller.error(error);
          } finally {
            controller.close();
          }
        },
      })
    );
  } else if (provider === "groq") {
    if (!groqApiKey) {
      return new Response("GROQ_API_KEY not configured", { status: 500 });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { 
            role: "system", 
            content: systemPrompt
          },
          { 
            role: "user", 
            content: messages[0].content
          }
        ],
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const result = await response.json();
    let content = result.choices[0].message.content;

    // Clean the content
    content = content
      .replace(/```(typescript|tsx|javascript|jsx)?/g, '')
      .replace(/```/g, '')
      .replace(/^.*?Here is.*?\n/g, '')
      .replace(/^.*?This component.*?\n/g, '')
      .replace(/^.*?I'll create.*?\n/g, '')
      .replace(/^.*?is a simple React.*?\n/g, '')
      .trim();

    // Model-specific processing
    if (provider === "groq" && groqModel?.includes('llama')) {
      // Fix common Llama issues
      content = content
        // Fix missing spaces after import
        .replace(/import(\w+)/g, 'import $1')
        .replace(/from(\w+)/g, 'from $1')
        // Fix spaces in JSX
        .replace(/className=(\w+)/g, 'className="$1"')
        // Fix missing spaces in function declarations
        .replace(/function(\w+)/g, 'function $1')
        // Fix missing spaces in arrow functions
        .replace(/\)=>/g, ') =>')
        // Fix missing spaces in object properties
        .replace(/,(\w+):/g, ', $1:')
        // Fix missing spaces after commas
        .replace(/,(\w+)/g, ', $1')
        // Fix missing spaces in type declarations
        .replace(/:(\w+)=/g, ': $1 =')
        // Remove any duplicate imports
        .replace(/(import React.*?\n)[\s\S]*?(import React.*?\n)/g, '$1')
        // Fix missing quotes in imports
        .replace(/from ([^'"][^;\n]+)/g, "from '$1'");
    }

    // Ensure proper imports and exports
    if (!content.startsWith('import React')) {
      content = 'import React, { useState } from \'react\';\n' + content;
    }

    if (!content.includes('export default')) {
      // Extract the component name and wrap it in export default
      const componentMatch = content.match(/function\s+(\w+)/);
      if (componentMatch) {
        const componentName = componentMatch[1];
        content = content.replace(
          new RegExp(`function\\s+${componentName}`),
          'export default function ' + componentName
        );
      }
    }

    // Final cleanup
    content = content
      // Remove any empty lines at start/end
      .trim()
      // Ensure single newline after imports
      .replace(/;\n+/g, ';\n')
      // Fix any remaining formatting issues
      .replace(/\s+/g, ' ')
      .replace(/> </g, '>\n<')
      .replace(/; /g, ';\n')
      .replace(/{ /g, '{\n  ')
      .replace(/ }/g, '\n}')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')')
      .replace(/ = /g, ' = ');

    // Create a readable stream with the processed content
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(content));
          controller.close();
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        }
      }
    );
  }
}

function getSystemPrompt(shadcn: boolean) {
  let systemPrompt = `You are an expert frontend React engineer who is also a great UI/UX designer. Follow these rules EXACTLY:

1. Start with EXACTLY this import: import React, { useState } from 'react';
2. Use EXACTLY this component format:
   export default function ComponentName() {
     // state and functions here
     return (
       // JSX here
     );
   }
3. NO const Component = () => {} syntax
4. NO arrow functions for the main component
5. NO named exports, ONLY default export
6. Use TypeScript types when needed
7. Use ONLY Tailwind classes for styling
8. Create interactive components with proper state management
9. NO comments or explanations in the code
10. NO text before or after the code
11. NO markdown formatting
12. NO arbitrary Tailwind values (e.g. h-[600px])
13. Use proper spacing and indentation
14. For placeholder images, use: <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16" />
15. ONLY use libraries explicitly mentioned (recharts for charts only)`;

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
