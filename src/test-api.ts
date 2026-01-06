// ============================================
// CEA API Direct Tests
// ============================================
// Tests raw SOAP API calls through the proxy
// Run: npx tsx src/test-api.ts

import { config } from "dotenv";
config();

import { ProxyAgent, fetch as undiciFetch } from "undici";

// ============================================
// Configuration
// ============================================

const CEA_API_BASE = "https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services";
const PROXY_URL = process.env.CEA_PROXY_URL || null;

// Test contract (use a real one for actual testing)
const TEST_CONTRACT = process.env.TEST_CONTRACT || "123456";

console.log("\n╔════════════════════════════════════════════════════════╗");
console.log("║           CEA API Direct Tests                         ║");
console.log("╚════════════════════════════════════════════════════════╝\n");
console.log(`Proxy: ${PROXY_URL || "NONE (direct connection)"}`);
console.log(`Test Contract: ${TEST_CONTRACT}`);
console.log("─".repeat(55));

// ============================================
// SOAP Payloads
// ============================================

function buildContratoSOAP(contrato: string): string {
    return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
    <soapenv:Header/>
    <soapenv:Body>
        <occ:consultaDetalleContrato>
            <numeroContrato>${contrato}</numeroContrato>
            <idioma>es</idioma>
        </occ:consultaDetalleContrato>
    </soapenv:Body>
</soapenv:Envelope>`;
}

function buildDeudaSOAP(contrato: string): string {
    return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:int="http://interfazgenericagestiondeuda.occamcxf.occam.agbar.com/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <soapenv:Header>
        <wsse:Security mustUnderstand="1">
            <wsse:UsernameToken wsu:Id="UsernameTokenWSGESTIONDEUDA">
                <wsse:Username>WSGESTIONDEUDA</wsse:Username>
                <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">WSGESTIONDEUDA</wsse:Password>
            </wsse:UsernameToken>
        </wsse:Security>
    </soapenv:Header>
    <soapenv:Body>
        <int:getDeuda>
            <tipoIdentificador>CONTRATO</tipoIdentificador>
            <valor>${contrato}</valor>
            <explotacion>12</explotacion>
            <idioma>es</idioma>
        </int:getDeuda>
    </soapenv:Body>
</soapenv:Envelope>`;
}

function buildConsumoSOAP(contrato: string): string {
    return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <soapenv:Header>
        <wsse:Security mustUnderstand="1">
            <wsse:UsernameToken wsu:Id="UsernameToken-WSGESTIONDEUDA">
                <wsse:Username>WSGESTIONDEUDA</wsse:Username>
                <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">WSGESTIONDEUDA</wsse:Password>
            </wsse:UsernameToken>
        </wsse:Security>
    </soapenv:Header>
    <soapenv:Body>
        <occ:getConsumos>
            <explotacion>12</explotacion>
            <contrato>${contrato}</contrato>
            <idioma>es</idioma>
        </occ:getConsumos>
    </soapenv:Body>
</soapenv:Envelope>`;
}

// ============================================
// Fetch with Proxy Support
// ============================================

async function fetchSOAP(endpoint: string, body: string): Promise<{ status: number; body: string; time: number }> {
    const url = `${CEA_API_BASE}/${endpoint}`;
    const start = Date.now();

    try {
        let response: Response;

        if (PROXY_URL) {
            const proxyAgent = new ProxyAgent(PROXY_URL);
            // @ts-ignore
            response = await undiciFetch(url, {
                method: "POST",
                headers: { "Content-Type": "text/xml;charset=UTF-8" },
                body,
                dispatcher: proxyAgent,
                // @ts-ignore
                signal: AbortSignal.timeout(30000)
            });
        } else {
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "text/xml;charset=UTF-8" },
                body,
                signal: AbortSignal.timeout(30000)
            });
        }

        const responseBody = await response.text();
        const time = Date.now() - start;

        return { status: response.status, body: responseBody, time };
    } catch (error) {
        const time = Date.now() - start;
        return { 
            status: 0, 
            body: error instanceof Error ? error.message : String(error),
            time 
        };
    }
}

// ============================================
// Test Cases
// ============================================

interface TestResult {
    name: string;
    endpoint: string;
    status: number;
    success: boolean;
    time: number;
    preview: string;
    error?: string;
}

async function testContrato(): Promise<TestResult> {
    const result = await fetchSOAP(
        "InterfazGenericaContratacionWS",
        buildContratoSOAP(TEST_CONTRACT)
    );

    const success = result.status === 200 && !result.body.includes("faultstring");
    
    return {
        name: "consultaDetalleContrato",
        endpoint: "InterfazGenericaContratacionWS",
        status: result.status,
        success,
        time: result.time,
        preview: result.body.substring(0, 200) + "...",
        error: success ? undefined : extractFault(result.body)
    };
}

async function testDeuda(): Promise<TestResult> {
    const result = await fetchSOAP(
        "InterfazGenericaGestionDeudaWS",
        buildDeudaSOAP(TEST_CONTRACT)
    );

    const success = result.status === 200 && !result.body.includes("faultstring");
    
    return {
        name: "getDeuda",
        endpoint: "InterfazGenericaGestionDeudaWS",
        status: result.status,
        success,
        time: result.time,
        preview: result.body.substring(0, 200) + "...",
        error: success ? undefined : extractFault(result.body)
    };
}

async function testConsumo(): Promise<TestResult> {
    const result = await fetchSOAP(
        "InterfazOficinaVirtualClientesWS",
        buildConsumoSOAP(TEST_CONTRACT)
    );

    const success = result.status === 200 && !result.body.includes("faultstring");

    return {
        name: "getConsumos",
        endpoint: "InterfazOficinaVirtualClientesWS",
        status: result.status,
        success,
        time: result.time,
        preview: result.body.substring(0, 200) + "...",
        error: success ? undefined : extractFault(result.body)
    };
}

function extractFault(xml: string): string {
    const match = xml.match(/<faultstring>([^<]+)<\/faultstring>/);
    return match ? match[1] : "Unknown error";
}

// ============================================
// Main Runner
// ============================================

async function runAllTests() {
    const results: TestResult[] = [];

    console.log("\n🔍 Running API Tests...\n");

    // Test 1: Contract Details
    process.stdout.write("  Testing consultaDetalleContrato... ");
    const contratoResult = await testContrato();
    results.push(contratoResult);
    console.log(contratoResult.success ? `✅ ${contratoResult.time}ms` : `❌ ${contratoResult.error}`);

    // Test 2: Debt Query
    process.stdout.write("  Testing getDeuda... ");
    const deudaResult = await testDeuda();
    results.push(deudaResult);
    console.log(deudaResult.success ? `✅ ${deudaResult.time}ms` : `❌ ${deudaResult.error}`);

    // Test 3: Consumption
    process.stdout.write("  Testing getConsumos... ");
    const consumoResult = await testConsumo();
    results.push(consumoResult);
    console.log(consumoResult.success ? `✅ ${consumoResult.time}ms` : `❌ ${consumoResult.error}`);

    // Summary
    console.log("\n" + "═".repeat(55));
    console.log("SUMMARY");
    console.log("═".repeat(55));

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\nPassed: ${passed}/${results.length}`);
    console.log(`Failed: ${failed}/${results.length}`);

    if (failed > 0) {
        console.log("\n❌ Failed Tests:");
        results.filter(r => !r.success).forEach(r => {
            console.log(`  - ${r.name}: ${r.error}`);
        });
    }

    // Detailed output option
    if (process.argv.includes("--verbose") || process.argv.includes("-v")) {
        console.log("\n📋 Detailed Responses:\n");
        results.forEach(r => {
            console.log(`\n--- ${r.name} ---`);
            console.log(`Status: ${r.status}`);
            console.log(`Time: ${r.time}ms`);
            console.log(`Preview:\n${r.preview}`);
        });
    }

    console.log("\n💡 Tip: Run with --verbose to see full responses");
    console.log("💡 Tip: Set TEST_CONTRACT=your_contract in .env\n");
}

// ============================================
// Quick Connectivity Test
// ============================================

async function testConnectivity() {
    console.log("\n🌐 Testing Connectivity...\n");

    const testUrls = [
        { name: "CEA Internal", url: "https://aquacis-cf-int.ceaqueretaro.gob.mx" },
        { name: "CEA App", url: "https://appcea.ceaqueretaro.gob.mx" },
        { name: "CEA Alt", url: "https://ceaqueretaro-cf-int.aquacis.com" }
    ];

    for (const test of testUrls) {
        process.stdout.write(`  ${test.name}... `);
        try {
            const start = Date.now();
            let response: Response;

            if (PROXY_URL) {
                const proxyAgent = new ProxyAgent(PROXY_URL);
                // @ts-ignore
                response = await undiciFetch(test.url, {
                    method: "GET",
                    dispatcher: proxyAgent,
                    // @ts-ignore
                    signal: AbortSignal.timeout(10000)
                });
            } else {
                response = await fetch(test.url, {
                    method: "GET",
                    signal: AbortSignal.timeout(10000)
                });
            }

            const time = Date.now() - start;
            console.log(`${response.status === 200 || response.status === 404 ? "✅" : "⚠️"} ${response.status} (${time}ms)`);
        } catch (error) {
            console.log(`❌ ${error instanceof Error ? error.message : "Connection failed"}`);
        }
    }
}

// ============================================
// Main
// ============================================

async function main() {
    const args = process.argv.slice(2);

    if (args.includes("--connectivity") || args.includes("-c")) {
        await testConnectivity();
    } else {
        await testConnectivity();
        await runAllTests();
    }
}

main().catch(console.error);
