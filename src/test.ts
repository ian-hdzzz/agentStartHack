// ============================================
// WaterHub Agent Server - Local Testing
// ============================================

import { config } from "dotenv";
config();

import { runWorkflow } from "./agent.js";
import { getMexicoDate } from "./tools.js";

// ============================================
// Test Cases (WaterHub: subir_voz | informacion | hablar_asesor)
// ============================================

const testCases = [
    { name: "Greeting", message: "Hola, buenas tardes", expectedClassification: "informacion" },
    { name: "What is WaterHub", message: "¿Qué es WaterHub?", expectedClassification: "informacion" },
    { name: "Subir voz - fuga", message: "Hay una fuga de agua en la calle principal", expectedClassification: "subir_voz" },
    { name: "Subir voz - sin agua", message: "Quiero reportar que no tenemos agua desde ayer", expectedClassification: "subir_voz" },
    { name: "Subir voz - alcantarilla", message: "La alcantarilla de mi colonia está tapada", expectedClassification: "subir_voz" },
    { name: "Ask for human (no advisors)", message: "Quiero hablar con una persona real", expectedClassification: "informacion" },
    { name: "How does it work", message: "¿Cómo funciona el mapa?", expectedClassification: "informacion" }
];

// ============================================
// Test Runner
// ============================================

async function runTests() {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║           WaterHub Agent Server - Test Suite          ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");

    console.log("📅 Test 1: Mexico Timezone");
    console.log("─".repeat(50));
    const mexicoDate = getMexicoDate();
    console.log(`  Current Mexico Time: ${mexicoDate.toISOString()}`);
    console.log(`  Formatted: ${mexicoDate.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`);
    console.log();

    if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️  Skipping workflow tests - OPENAI_API_KEY not set\n");
        return;
    }

    console.log("🤖 Test 2: Agent Workflow Tests");
    console.log("─".repeat(50));

    let passed = 0;
    let failed = 0;

    for (const test of testCases) {
        process.stdout.write(`  ${test.name}... `);
        try {
            const result = await runWorkflow({
                input_as_text: test.message,
                conversationId: `test-${Date.now()}`
            });
            if (result.classification === test.expectedClassification) {
                console.log(`✅ (${result.classification})`);
                passed++;
            } else {
                console.log(`❌ Expected ${test.expectedClassification}, got ${result.classification}`);
                failed++;
            }
            await new Promise((r) => setTimeout(r, 500));
        } catch (error) {
            console.log(`❌ Error: ${error}`);
            failed++;
        }
    }

    console.log();
    console.log("═".repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log("═".repeat(50));
}

// ============================================
// Interactive Mode
// ============================================

async function interactiveMode() {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║           WaterHub Agent - Interactive Mode           ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");

    if (!process.env.OPENAI_API_KEY) {
        console.log("❌ OPENAI_API_KEY not set. Please configure .env file.\n");
        return;
    }

    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const conversationId = `interactive-${Date.now()}`;
    console.log("Type your message (or 'quit' to exit):\n");

    const ask = () => {
        rl.question("You: ", async (input) => {
            if (input.toLowerCase() === "quit") {
                console.log("\n👋 ¡Hasta luego!\n");
                rl.close();
                return;
            }
            try {
                const result = await runWorkflow({ input_as_text: input, conversationId });
                console.log(`\nWaterHub [${result.classification}]: ${result.output_text}\n`);
            } catch (error) {
                console.log(`\n❌ Error: ${error}\n`);
            }
            ask();
        });
    };
    ask();
}

// ============================================
// Main
// ============================================

const args = process.argv.slice(2);
if (args.includes("--interactive") || args.includes("-i")) {
    interactiveMode();
} else {
    runTests()
        .then(() => process.exit(0))
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
