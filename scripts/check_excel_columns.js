// Quick script to check Excel column names
const XLSX = require('xlsx');

console.log('📖 Reading Employee Master Excel file...\n');

try {
  const workbook = XLSX.readFile('Employee Master as on 09.02.2026.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log('═══════════════════════════════════════════');
  console.log('📊 Excel File Analysis');
  console.log('═══════════════════════════════════════════\n');

  console.log(`Sheet Name: ${sheetName}`);
  console.log(`Total Rows: ${data.length}\n`);

  console.log('Column Names:');
  console.log('─────────────────────────────────────────');
  const columns = Object.keys(data[0]);
  columns.forEach((col, index) => {
    console.log(`${index + 1}. ${col}`);
  });

  console.log('\n═══════════════════════════════════════════');
  console.log('Sample Row (First Employee):');
  console.log('═══════════════════════════════════════════\n');
  console.log(JSON.stringify(data[0], null, 2));

  console.log('\n✅ Analysis complete!');
  console.log('\nNext step: Run migrate_employees.js to import data\n');

} catch (error) {
  console.error('❌ Error reading Excel file:', error.message);
  console.error('\nMake sure the file "Employee Master as on 09.02.2026.xlsx" exists in this directory.\n');
}
