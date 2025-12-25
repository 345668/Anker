import { folkService } from "../server/services/folk";

async function importCompanies() {
  const groupId = "grp_8ae8dd89-d8de-419e-9697-01e42bf5a7a1";
  const userId = "33133283";
  
  console.log("Starting companies import from 'lvl up - 3000 investors' group...");
  
  try {
    const importRun = await folkService.startCompaniesImportFromGroup(groupId, userId);
    console.log("Import started successfully!");
    console.log("Import Run ID:", importRun.id);
    console.log("Status:", importRun.status);
    console.log("Total records:", importRun.totalRecords);
    
    // Wait for completion
    let status = importRun.status;
    while (status === "in_progress") {
      await new Promise(r => setTimeout(r, 5000));
      const updated = await folkService.getImportRunStatus(importRun.id);
      if (updated) {
        status = updated.status;
        console.log(`Progress: ${updated.processedRecords}/${updated.totalRecords} - ${updated.status}`);
      }
    }
    
    console.log("Import completed!");
    process.exit(0);
  } catch (error: any) {
    console.error("Import failed:", error.message);
    process.exit(1);
  }
}

importCompanies();
