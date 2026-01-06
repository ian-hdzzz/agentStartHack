import { config } from "dotenv";
config();

const CEA_API_BASE = "https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services";
const CONTRACT = process.argv[2] || "523160";

const contratoSOAP = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
    <soapenv:Header/>
    <soapenv:Body>
        <occ:consultaDetalleContrato>
            <numeroContrato>${CONTRACT}</numeroContrato>
            <idioma>es</idioma>
        </occ:consultaDetalleContrato>
    </soapenv:Body>
</soapenv:Envelope>`;

const deudaSOAP = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:int="http://interfazgenericagestiondeuda.occamcxf.occam.agbar.com/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
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
            <valor>${CONTRACT}</valor>
            <explotacion>12</explotacion>
            <idioma>es</idioma>
        </int:getDeuda>
    </soapenv:Body>
</soapenv:Envelope>`;

const consumoSOAP = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
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
            <contrato>${CONTRACT}</contrato>
            <idioma>es</idioma>
        </occ:getConsumos>
    </soapenv:Body>
</soapenv:Envelope>`;

function extract(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match ? match[1] : "";
}

async function fetchSOAP(endpoint: string, body: string): Promise<string> {
    const response = await fetch(`${CEA_API_BASE}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "text/xml;charset=UTF-8" },
        body,
    });
    return response.text();
}

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log(`  CONTRACT ${CONTRACT} - FULL INFORMATION`);
    console.log("=".repeat(60));

    // 1. Contract Details
    const contratoXml = await fetchSOAP("InterfazGenericaContratacionWS", contratoSOAP);

    console.log("\n--- CONTRACT DETAILS ---\n");
    console.log(`  Contract Number:    ${extract(contratoXml, "numeroContrato")}`);
    console.log(`  Holder:             ${extract(contratoXml, "titular")}`);
    console.log(`  Tax ID:             ${extract(contratoXml, "cifNif")}`);
    console.log(`  Service Type:       ${extract(contratoXml, "descUso")}`);
    console.log(`  Registration Date:  ${extract(contratoXml, "fechaAlta")?.split("T")[0]}`);
    console.log(`  Meter Number:       ${extract(contratoXml, "numeroContador")}`);
    console.log(`  Telemetry:          ${extract(contratoXml, "telelectura")}`);
    console.log(`  Payment Plan:       ${extract(contratoXml, "tienePlanPago") === "N" ? "No" : "Yes"}`);

    console.log("\n--- ADDRESS ---\n");
    console.log(`  Street:             ${extract(contratoXml, "calle")} ${extract(contratoXml, "numero")}`);
    console.log(`  Municipality:       ${extract(contratoXml, "municipio")}`);
    console.log(`  Province:           ${extract(contratoXml, "provincia")}`);
    console.log(`  Correspondence:     ${extract(contratoXml, "dirCorrespondencia")}`);
    console.log(`  Billing Address:    ${extract(contratoXml, "direccionFacturacion")}`);

    console.log("\n--- CONTACT INFO ---\n");
    console.log(`  Phone 1:            ${extract(contratoXml, "telefono1") || "(not registered)"}`);
    console.log(`  Phone 2:            ${extract(contratoXml, "telefono2") || "(not registered)"}`);
    console.log(`  Email:              ${extract(contratoXml, "email") || "(not registered)"}`);
    console.log(`  Notification:       ${extract(contratoXml, "canalNotificacion")}`);
    console.log(`  Online Billing:     ${extract(contratoXml, "servicioFacturaOnline")}`);

    // 2. Debt Info
    const deudaXml = await fetchSOAP("InterfazGenericaGestionDeudaWS", deudaSOAP);

    console.log("\n--- DEBT INFORMATION ---\n");
    console.log(`  Total Debt:         $${extract(deudaXml, "deudaTotal")}`);
    console.log(`  Current Debt:       $${extract(deudaXml, "deuda")}`);
    console.log(`  Commission:         $${extract(deudaXml, "deudaComision")}`);
    console.log(`  Previous Balance:   $${extract(deudaXml, "saldoAnterior")}`);
    console.log(`  Total Cycles Owed:  ${extract(deudaXml, "ciclosTotales")}`);
    console.log(`  Previous Cycles:    ${extract(deudaXml, "ciclosAnteriores")}`);
    console.log(`  Payment Document:   ${extract(deudaXml, "documentoPago") || "(none)"}`);
    console.log(`  Status:             ${extract(deudaXml, "descripcionError")}`);

    // 3. Consumption History
    const consumoXml = await fetchSOAP("InterfazOficinaVirtualClientesWS", consumoSOAP);

    console.log("\n--- CONSUMPTION HISTORY ---\n");
    console.log("  Period          Year    Consumption   Estimated");
    console.log("  " + "-".repeat(50));

    const consumos = consumoXml.split("<Consumo>").slice(1);
    consumos.forEach((c) => {
        const periodo = c.match(/<periodo>([^<]*)<\/periodo>/)?.[1]?.replace(/&lt;|&gt;/g, "") || "";
        const year = c.match(/<año>([^<]*)<\/año>/)?.[1] || "";
        const m3 = c.match(/<metrosCubicos>([^<]*)<\/metrosCubicos>/)?.[1] || "0";
        const estimado = c.match(/<estimado>([^<]*)<\/estimado>/)?.[1] === "true" ? "Yes" : "No";
        console.log(`  ${periodo.padEnd(16)} ${year}    ${m3.padStart(6)} m³      ${estimado}`);
    });

    // Meter history
    console.log("\n--- METER HISTORY ---\n");
    const meters = contratoXml.split("<ContratoContadorDTO>").slice(1);
    meters.forEach((m, i) => {
        const serial = m.match(/<numeroSerie>([^<]*)<\/numeroSerie>/)?.[1] || "";
        const status = m.match(/<estadoContador>([^<]*)<\/estadoContador>/)?.[1] || "";
        const installed = m.match(/<fechaInstalacion>([^<]*)<\/fechaInstalacion>/)?.[1]?.split("T")[0] || "";
        console.log(`  Meter ${i + 1}:`);
        console.log(`    Serial:       ${serial}`);
        console.log(`    Status:       ${status === "1" ? "Active" : "Inactive"}`);
        console.log(`    Installed:    ${installed}`);
    });

    console.log("\n" + "=".repeat(60) + "\n");
}

main().catch(console.error);
