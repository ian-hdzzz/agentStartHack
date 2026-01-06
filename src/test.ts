// ============================================
// CEA Agent Server - Local Testing
// ============================================

import { config } from "dotenv";
config();

import { runWorkflow } from "./agent.js";
import { generateTicketFolio, getMexicoDate } from "./tools.js";

// ============================================
// Test Cases
// ============================================

const testCases = [
    {
        name: "Greeting",
        message: "Hola, buenas tardes",
        expectedClassification: "informacion"
    },
    {
        name: "Payment Query",
        message: "Quiero saber cuánto debo de mi recibo",
        expectedClassification: "pagos"
    },
    {
        name: "Consumption Query",
        message: "Cuál es mi consumo de agua del mes pasado",
        expectedClassification: "consumos"
    },
    {
        name: "Leak Report",
        message: "Hay una fuga de agua en la calle principal",
        expectedClassification: "fuga"
    },
    {
        name: "Contract Query",
        message: "Necesito un contrato nuevo para mi casa",
        expectedClassification: "contrato"
    },
    {
        name: "Ticket Status",
        message: "Quiero ver el estado de mi reporte",
        expectedClassification: "tickets"
    },
    {
        name: "Human Advisor",
        message: "Quiero hablar con una persona real",
        expectedClassification: "hablar_asesor"
    },
    {
        name: "Digital Receipt",
        message: "Quiero cambiar a recibo digital",
        expectedClassification: "pagos"
    },
    {
        name: "Payment with Contract",
        message: "Mi contrato es 123456, quiero saber mi saldo",
        expectedClassification: "pagos"
    }
];

// ============================================
// Test Runner
// ============================================

async function runTests() {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║           CEA Agent Server - Test Suite                ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");
    
    // Test 1: Ticket Folio Generation
    console.log("📝 Test 1: Ticket Folio Generation");
    console.log("─".repeat(50));
    
    const folio1 = generateTicketFolio("fuga");
    const folio2 = generateTicketFolio("fuga");
    const folio3 = generateTicketFolio("pagos");
    
    console.log(`  Folio 1 (fuga):  ${folio1}`);
    console.log(`  Folio 2 (fuga):  ${folio2}`);
    console.log(`  Folio 3 (pagos): ${folio3}`);
    
    const folioPattern = /^CEA-[A-Z]{3}-\d{6}-\d{4}$/;
    console.log(`  ✅ Format valid: ${folioPattern.test(folio1) && folioPattern.test(folio2) && folioPattern.test(folio3)}`);
    console.log(`  ✅ Sequential: ${folio2 > folio1}`);
    console.log();
    
    // Test 2: Date Utility
    console.log("📅 Test 2: Mexico Timezone");
    console.log("─".repeat(50));
    
    const mexicoDate = getMexicoDate();
    console.log(`  Current Mexico Time: ${mexicoDate.toISOString()}`);
    console.log(`  Formatted: ${mexicoDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`);
    console.log();
    
    // Test 3: Workflow Tests (only if OPENAI_API_KEY is set)
    if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️  Skipping workflow tests - OPENAI_API_KEY not set\n");
        return;
    }
    
    console.log("🤖 Test 3: Agent Workflow Tests");
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
            
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 500));
            
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
    console.log("║           CEA Agent - Interactive Mode                 ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");
    
    if (!process.env.OPENAI_API_KEY) {
        console.log("❌ OPENAI_API_KEY not set. Please configure .env file.\n");
        return;
    }
    
    const readline = await import("readline");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const conversationId = `interactive-${Date.now()}`;
    
    console.log("Type your message (or 'quit' to exit):\n");
    
    const ask = () => {
        rl.question("You: ", async (input) => {
            if (input.toLowerCase() === 'quit') {
                console.log("\n👋 ¡Hasta luego!\n");
                rl.close();
                return;
            }
            
            try {
                const result = await runWorkflow({
                    input_as_text: input,
                    conversationId
                });
                
                console.log(`\nMaría [${result.classification}]: ${result.output_text}\n`);
                
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
    runTests().then(() => process.exit(0)).catch((e) => {
        console.error(e);
        process.exit(1);
    });
}