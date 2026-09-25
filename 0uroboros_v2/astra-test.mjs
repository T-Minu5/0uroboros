import "dotenv/config";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log(
  "Key loaded:",
  !!process.env.OPENAI_API_KEY,
  "Starts with:",
  process.env.OPENAI_API_KEY?.slice(0, 7),
  "Ends with:",
  process.env.OPENAI_API_KEY?.slice(-4)
);

const response = await openai.responses.create({
  model: "gpt-5.6-sol",
  input: "Reply with exactly: OpenAI connection successful.",
});

console.log(response.output_text);
