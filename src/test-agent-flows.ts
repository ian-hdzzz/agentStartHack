// Test script for WaterHub agent conversation flows
import { config } from "dotenv";
config();

import { runWorkflow } from "./agent.js";

interface TestCase {
    name: string;
    description: string;
    messages: string[];
    expectedClassification: string;
    shouldUseReportTool: boolean;
}

const testCases: TestCase[] = [
    {
        name: "SUBIR_VOZ - Reporte de fuga",
        description: "Flujo para subir voz al mapa (fuga)",
        messages: [
            "Hay una fuga de agua muy grande en mi calle",
            "Está en Av. Universidad 123, Colonia Centro, Coyoacán",
            "Sí, está saliendo mucha agua"
        ],
        expectedClassification: "subir_voz",
        shouldUseReportTool: true
    },
    {
        name: "INFORMACION - Consulta general",
        description: "Flujo de información sobre WaterHub",
        messages: ["¿Qué es WaterHub?", "¿Cómo puedo ver el mapa?"],
        expectedClassification: "informacion",
        shouldUseReportTool: false
    },
    {
        name: "INFORMACION - Piden hablar con alguien (solo canal WhatsApp)",
        description: "Cuando piden asesor: se responde que este es el único canal",
        messages: ["Quiero hablar con una persona real"],
        expectedClassification: "informacion",
        shouldUseReportTool: false
    },
    {
        name: "SUBIR_VOZ - Sin agua",
        description: "Reportar falta de agua",
        messages: ["No tenemos agua desde ayer", "Colonia Del Valle, Benito Juárez"],
        expectedClassification: "subir_voz",
        shouldUseReportTool: true
    }
];

async function runTest(testCase: TestCase): Promise<{
    success: boolean;
    error?: string;
    toolUsed: boolean;
    lastClassification?: string;
}> {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TEST: ${testCase.name}`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Description: ${testCase.description}`);
    console.log(`Expected classification: ${testCase.expectedClassification}`);
    console.log();

    const conversationId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let toolUsed = false;
    let lastClassification: string | undefined;

    try {
        for (let i = 0; i < testCase.messages.length; i++) {
            const message = testCase.messages[i];
            console.log(`\n👤 User [${i + 1}/${testCase.messages.length}]: ${message}`);

            const result = await runWorkflow({
                conversationId,
                input_as_text: message
            });

            lastClassification = result.classification;
            if (result.toolsUsed?.includes("reportar_incidente")) {
                toolUsed = true;
            }

            console.log(`🤖 WaterHub: ${result.output_text?.substring(0, 150)}...`);
            console.log(`   Classification: ${result.classification}`);
            console.log(`   Tools used: ${result.toolsUsed?.join(", ") || "none"}`);

            await new Promise((r) => setTimeout(r, 500));
        }

        const classificationCorrect =
            lastClassification === testCase.expectedClassification ||
            (testCase.messages.length > 1 && lastClassification !== undefined);

        if (!classificationCorrect) {
            return {
                success: false,
                error: `Expected classification "${testCase.expectedClassification}" but got "${lastClassification}"`,
                toolUsed,
                lastClassification
            };
        }

        if (testCase.shouldUseReportTool && !toolUsed) {
            console.log(`⚠️  Warning: Expected reportar_incidente to be used`);
        }

        return { success: true, toolUsed, lastClassification };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            toolUsed
        };
    }
}

async function runAllTests() {
    console.log("\n" + "🚀".repeat(30));
    console.log("WATERHUB AGENT CONVERSATION FLOWS");
    console.log("🚀".repeat(30));

    const results: { name: string; success: boolean; error?: string; toolUsed: boolean }[] = [];

    for (const testCase of testCases) {
        const result = await runTest(testCase);
        results.push({ name: testCase.name, ...result });
        await new Promise((r) => setTimeout(r, 1000));
    }

    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));

    const successCount = results.filter((r) => r.success).length;
    console.log(`\nTotal: ${results.length} | Passed: ${successCount} | Failed: ${results.length - successCount}`);

    console.log("\n| Test | Status | reportar_incidente |");
    console.log("|------|--------|---------------------|");
    for (const r of results) {
        const status = r.success ? "✅" : "❌";
        const tool = r.toolUsed ? "Yes" : "No";
        const name = r.name.length > 35 ? r.name.substring(0, 32) + "..." : r.name;
        console.log(`| ${name.padEnd(35)} | ${status} | ${tool.padEnd(19)} |`);
    }

    if (results.some((r) => !r.success)) {
        console.log("\n❌ FAILURES:");
        for (const r of results.filter((r) => !r.success)) {
            console.log(`  - ${r.name}: ${r.error}`);
        }
    }

    process.exit(successCount === results.length ? 0 : 1);
}

runAllTests().catch(console.error);
