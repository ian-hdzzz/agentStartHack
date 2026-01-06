import { config } from "dotenv";
config();

const CEA_API_BASE = "https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services";

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

async function testContractAPI() {
    console.log('\n🔍 Testing CEA Contract API from this server\n');
    
    const contrato = "523160";
    const soapBody = buildContratoSOAP(contrato);
    
    try {
        const response = await fetch(`${CEA_API_BASE}/InterfazGenericaContratacionWS`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml;charset=UTF-8'
            },
            body: soapBody
        });
        
        console.log('Response Status:', response.status, response.statusText);
        const xml = await response.text();
        console.log('\nResponse Body:');
        console.log(xml);
        
        if (response.status === 200 && xml.includes('titular')) {
            console.log('\n✅ SUCCESS! API is accessible from this server');
        } else if (response.status === 403) {
            console.log('\n❌ BLOCKED! This server IP is not whitelisted');
        }
        
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
    }
}

testContractAPI().catch(console.error);
