"use client";

import CodeViewer from "@/components/code-viewer";
import { useScrollTo } from "@/hooks/use-scroll-to";
import { CheckIcon } from "@heroicons/react/16/solid";
import { ArrowLongRightIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import { ArrowUpOnSquareIcon } from "@heroicons/react/24/outline";
import * as Select from "@radix-ui/react-select";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion } from "framer-motion";
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import LoadingDots from "../../components/loading-dots";

function removeCodeFormatting(code: string): string {
  return code.replace(/```(?:typescript|javascript|tsx)?\n([\s\S]*?)```/g, '$1').trim();
}

export default function Home() {
  let [status, setStatus] = useState<
    "initial" | "creating" | "created" | "updating" | "updated" | "error"
  >("initial");
  let [error, setError] = useState<string>("");
  let [prompt, setPrompt] = useState("");
  let [provider, setProvider] = useState<"gemini" | "groq">("gemini");
  let models = {
    gemini: [
      {
        label: "gemini-2.0-flash-exp",
        value: "gemini-2.0-flash-exp",
      },
      {
        label: "gemini-1.5-pro",
        value: "gemini-1.5-pro",
      },
      {
        label: "gemini-1.5-flash",
        value: "gemini-1.5-flash",
      }
    ],
    groq: [
      {
        label: "Mixtral 8x7B (32K context)",
        value: "mixtral-8x7b-32768",
      },
      {
        label: "LLaMA3 Groq 70B (Tool Use)",
        value: "llama3-groq-70b-8192-tool-use-preview",
      },
      {
        label: "Gemma 2 9B",
        value: "gemma2-9b-it",
      },
      {
        label: "LLaMA3 70B",
        value: "llama3-70b-8192",
      },
      {
        label: "LLaMA3 8B",
        value: "llama3-8b-8192",
      },
      {
        label: "LLaMA 3.2 11B",
        value: "llama-3.2-11b-text-preview",
      },
      {
        label: "LLaMA 3.1 70B Versatile",
        value: "llama-3.1-70b-versatile",
      },
      {
        label: "Gemma 7B",
        value: "gemma-7b-it",
      },
      {
        label: "LLaMA3 Groq 8B (Tool Use)",
        value: "llama3-groq-8b-8192-tool-use-preview",
      },
      {
        label: "LLaMA 3.1 8B Instant",
        value: "llama-3.1-8b-instant",
      }
    ]
  };
  let [model, setModel] = useState(models.gemini[0].value);
  let [shadcn, setShadcn] = useState(false);
  let [modification, setModification] = useState("");
  let [generatedCode, setGeneratedCode] = useState("");
  let [processedCode, setProcessedCode] = useState("");
  let [initialAppConfig, setInitialAppConfig] = useState({
    model: "",
    shadcn: true,
  });
  let [ref, scrollTo] = useScrollTo();
  let [messages, setMessages] = useState<{ role: string; content: string }[]>(
    [],
  );

  let loading = status === "creating" || status === "updating";

  useEffect(() => {
    if (!generatedCode) return;
    
    // Process the code before setting it
    const cleanCode = generatedCode
      .replace(/```(typescript|tsx|javascript|jsx)?/g, '')
      .replace(/```/g, '')
      .trim();

    // Ensure it has proper structure
    let finalCode = cleanCode;
    if (!finalCode.startsWith('import React')) {
      finalCode = 'import React, { useState } from \'react\';\n' + finalCode;
    }

    if (!finalCode.includes('export default')) {
      const componentMatch = finalCode.match(/function\s+(\w+)/);
      if (componentMatch) {
        const componentName = componentMatch[1];
        finalCode = finalCode.replace(
          new RegExp(`function\\s+${componentName}`),
          'export default function ' + componentName
        );
      }
    }

    // Clean up any formatting issues
    finalCode = finalCode
      .replace(/\s+/g, ' ')
      .replace(/> </g, '>\n<')
      .replace(/; /g, ';\n')
      .replace(/{ /g, '{\n  ')
      .replace(/ }/g, '\n}')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')')
      .replace(/ = /g, ' = ')
      .trim();

    setProcessedCode(finalCode);
  }, [generatedCode]);

  // Wrapper function to handle JSX compilation
  function createComponent(code: string) {
    try {
      // Only process if we have a complete component
      if (!code.includes('export default') || !code.includes('return')) {
        return null;
      }

      // Remove imports and exports
      const cleanCode = code
        .replace(/import\s+React,\s*{\s*useState\s*}\s*from\s*['"]react['"];?\n?/, '')
        .replace(/import\s+{\s*([^}]+)\s*}\s*from\s*['"][^'"]+['"];?\n?/g, '')
        .replace(/import\s+(\w+)\s*from\s*['"][^'"]+['"];?\n?/g, '')
        .replace(/export\s+default\s+/, '')
        .trim();

      // Extract the component name and body
      const functionMatch = cleanCode.match(/function\s+(\w+)\s*\([^)]*\)\s*{([\s\S]*)}/);
      if (!functionMatch) return null;

      const [_, componentName, componentBody] = functionMatch;
      
      // Create a proper React component
      return (React: typeof import('react'), useState: typeof import('react').useState) => {
        try {
          // Create the component function
          const ComponentFunction = new Function(
            'React', 
            'useState', 
            `
            return function ${componentName}(props) {
              const useState = arguments[1];
              ${componentBody}
            }
            `
          )(React, useState);

          // Ensure it's a valid component
          ComponentFunction.displayName = componentName;
          return ComponentFunction;
        } catch (error) {
          return null;
        }
      };
    } catch (error) {
      return null;
    }
  }

  const PreviewComponent = useMemo(() => {
    if (!processedCode) return null;
    
    try {
      const factory = createComponent(processedCode);
      if (!factory) return null;

      const Component = factory(React, useState);
      if (!Component) return null;

      return Component;
    } catch (error) {
      return null;
    }
  }, [processedCode]);

  const LivePreview = useMemo(() => {
    try {
      if (!PreviewComponent) {
        return null;
      }
      return React.createElement(PreviewComponent);
    } catch (error) {
      return null;
    }
  }, [PreviewComponent]);

  // Update model when provider changes
  useEffect(() => {
    if (provider === "groq" && !models.groq.find(m => m.value === model)) {
      setModel(models.groq[0].value);
    } else if (provider === "gemini" && !models.gemini.find(m => m.value === model)) {
      setModel(models.gemini[0].value);
    }
  }, [provider]);

  async function createApp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (status !== "initial") {
      scrollTo({ delay: 0.5 });
    }

    setStatus("creating");
    setError("");
    setGeneratedCode("");

    try {
      let res = await fetch("/api/generateCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider === "gemini" ? model : undefined,
          provider,
          groqModel: provider === "groq" ? model : undefined,
          shadcn,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || res.statusText);
        } catch {
          throw new Error(errorText || res.statusText);
        }
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      let receivedData = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = new TextDecoder().decode(value);
          receivedData += text;
          
          // Only update code when we have a complete component
          if (receivedData.includes('import') && receivedData.includes('export default')) {
            const cleanedData = removeCodeFormatting(receivedData)
              .replace(/```(typescript|tsx|javascript|jsx)?/g, '')
              .replace(/```/g, '')
              .replace(/Here is.*?\n/g, '')
              .replace(/This component.*?\n/g, '')
              .replace(/I'll create.*?\n/g, '')
              .trim();
            
            setGeneratedCode(cleanedData);
          }
        }

        setMessages([{ role: "user", content: prompt }]);
        setInitialAppConfig({ model, shadcn });
        setStatus("created");
      } catch (error) {
        throw new Error("Error reading stream: " + (error as Error).message);
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Error generating code:", error);
      setError((error as Error).message);
      setStatus("error");
    }
  }

  useEffect(() => {
    let el = document.querySelector(".cm-scroller");
    if (el && loading) {
      let end = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: end });
    }
  }, [loading, generatedCode]);

  useEffect(() => {
    const decoder = new TextDecoder();
    let buffer = '';

    return () => {
      buffer = '';
    };
  }, []);

  return (
    <main className="mt-12 flex w-full flex-1 flex-col items-center px-4 text-center sm:mt-1">
      <a
        className="mb-4 inline-flex h-7 shrink-0 items-center gap-[9px] rounded-[50px] border-[0.5px] border-solid border-[#E6E6E6] bg-[rgba(234,238,255,0.65)] bg-gray-100 px-7 py-5 shadow-[0px_1px_1px_0px_rgba(0,0,0,0.25)]"
        href={provider === "gemini" ? "https://ai.google.dev/gemini-api/docs" : "https://console.groq.com/docs"}
        target="_blank"
      >
        <span className="text-center">
          Powered by <span className="font-medium">{provider === "gemini" ? "Gemini API" : "Groq API"}</span>
        </span>
      </a>
      <h1 className="my-6 max-w-3xl text-4xl font-bold text-gray-800 sm:text-6xl">
        Turn your <span className="text-blue-600">idea</span>
        <br /> into an <span className="text-blue-600">app</span>
      </h1>

      {error && (
        <div className="mb-6 w-full max-w-xl rounded-lg bg-red-100 p-4 text-red-700">
          {error}
        </div>
      )}

      <form className="w-full max-w-xl" onSubmit={createApp}>
        <fieldset disabled={loading} className="disabled:opacity-75">
          <div className="relative mt-5">
            <div className="absolute -inset-2 rounded-[32px] bg-gray-300/50" />
            <div className="relative flex rounded-3xl bg-white shadow-sm">
              <div className="relative flex flex-grow items-stretch focus-within:z-10">
                <textarea
                  rows={3}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  name="prompt"
                  className="w-full resize-none rounded-l-3xl bg-transparent px-6 py-5 text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                  placeholder="Build me a calculator app..."
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-3xl px-3 py-2 text-sm font-semibold text-blue-500 hover:text-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:text-gray-900"
              >
                {status === "creating" ? (
                  <LoadingDots color="black" style="large" />
                ) : (
                  <ArrowLongRightIcon className="-ml-0.5 size-6" />
                )}
              </button>
            </div>
          </div>
          <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row sm:items-center sm:gap-8">
            {/* Provider Selection */}
            <div className="flex items-center justify-between gap-3 sm:justify-center">
              <p className="text-gray-500 sm:text-xs">Provider:</p>
              <Select.Root
                name="provider"
                disabled={loading}
                value={provider}
                onValueChange={(value: "gemini" | "groq") => setProvider(value)}
              >
                <Select.Trigger className="group flex w-40 max-w-xs items-center rounded-2xl border-[6px] border-gray-300 bg-white px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                  <Select.Value />
                  <Select.Icon className="ml-auto">
                    <ChevronDownIcon className="size-6 text-gray-300 group-focus-visible:text-gray-500 group-enabled:group-hover:text-gray-500" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-md bg-white shadow-lg">
                    <Select.Viewport className="p-2">
                      <Select.Item
                        value="gemini"
                        className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm data-[highlighted]:bg-gray-100 data-[highlighted]:outline-none"
                      >
                        <Select.ItemText asChild>
                          <span className="inline-flex items-center gap-2 text-gray-500">
                            <div className="size-2 rounded-full bg-green-500" />
                            Gemini
                          </span>
                        </Select.ItemText>
                        <Select.ItemIndicator className="ml-auto">
                          <CheckIcon className="size-5 text-blue-600" />
                        </Select.ItemIndicator>
                      </Select.Item>
                      <Select.Item
                        value="groq"
                        className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm data-[highlighted]:bg-gray-100 data-[highlighted]:outline-none"
                      >
                        <Select.ItemText asChild>
                          <span className="inline-flex items-center gap-2 text-gray-500">
                            <div className="size-2 rounded-full bg-purple-500" />
                            Groq
                          </span>
                        </Select.ItemText>
                        <Select.ItemIndicator className="ml-auto">
                          <CheckIcon className="size-5 text-blue-600" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Model Selection */}
            <div className="flex items-center justify-between gap-3 sm:justify-center">
              <p className="text-gray-500 sm:text-xs">Model:</p>
              <Select.Root
                name="model"
                disabled={loading}
                value={model}
                onValueChange={(value) => setModel(value)}
              >
                <Select.Trigger className="group flex w-60 max-w-xs items-center rounded-2xl border-[6px] border-gray-300 bg-white px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                  <Select.Value />
                  <Select.Icon className="ml-auto">
                    <ChevronDownIcon className="size-6 text-gray-300 group-focus-visible:text-gray-500 group-enabled:group-hover:text-gray-500" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-md bg-white shadow-lg">
                    <Select.Viewport className="p-2">
                      {models[provider].map((model) => (
                        <Select.Item
                          key={model.value}
                          value={model.value}
                          className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm data-[highlighted]:bg-gray-100 data-[highlighted]:outline-none"
                        >
                          <Select.ItemText asChild>
                            <span className="inline-flex items-center gap-2 text-gray-500">
                              <div className="size-2 rounded-full bg-green-500" />
                              {model.label}
                            </span>
                          </Select.ItemText>
                          <Select.ItemIndicator className="ml-auto">
                            <CheckIcon className="size-5 text-blue-600" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            <div className="flex h-full items-center justify-between gap-3 sm:justify-center">
              <p className="text-gray-500 sm:text-xs">Use shadcn/ui:</p>
              <Switch.Root
                className="group flex w-20 max-w-xs items-center rounded-2xl border-[6px] border-gray-300 bg-white p-1.5 text-sm shadow-inner transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 data-[state=checked]:bg-blue-500"
                id="shadcn"
                name="shadcn"
                checked={shadcn}
                onCheckedChange={(value) => setShadcn(value)}
              >
                <Switch.Thumb className="size-7 rounded-lg bg-gray-200 shadow-[0_1px_2px] shadow-gray-400 transition data-[state=checked]:translate-x-7 data-[state=checked]:bg-white data-[state=checked]:shadow-gray-600" />
              </Switch.Root>
            </div>
          </div>
        </fieldset>
      </form>

      <hr className="border-1 mb-20 h-px bg-gray-700 dark:bg-gray-700" />

      {(status !== "initial" || error) && (
        <motion.div
          initial={{ height: 0 }}
          animate={{
            height: "auto",
            overflow: "hidden",
            transitionEnd: { overflow: "visible" },
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          className="w-full pb-[25vh] pt-1"
          onAnimationComplete={() => scrollTo()}
          ref={ref}
        >
          <div className="relative mt-8 w-full overflow-hidden">
            <div className="isolate">
              <CodeViewer code={processedCode} showEditor />
            </div>

            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={status === "updating" ? { x: "100%" } : undefined}
                  animate={status === "updating" ? { x: "0%" } : undefined}
                  exit={{ x: "100%" }}
                  transition={{
                    type: "spring",
                    bounce: 0,
                    duration: 0.85,
                    delay: 0.5,
                  }}
                  className="absolute inset-x-0 bottom-0 top-1/2 flex items-center justify-center rounded-r border border-gray-400 bg-gradient-to-br from-gray-100 to-gray-300 md:inset-y-0 md:left-1/2 md:right-0"
                >
                  <p className="animate-pulse text-3xl font-bold">
                    {status === "creating"
                      ? "Building your app..."
                      : "Updating your app..."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {LivePreview}
          </div>
        </motion.div>
      )}
    </main>
  );
}

async function minDelay<T>(promise: Promise<T>, ms: number) {
  let delay = new Promise((resolve) => setTimeout(resolve, ms));
  let [p] = await Promise.all([promise, delay]);
  return p;
}
