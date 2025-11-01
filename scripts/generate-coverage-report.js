#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function generateCoverageReport() {
  const coverageDir = path.join(__dirname, '..', 'coverage');

  // Ensure coverage directory exists
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  const backendCoveragePath = path.join(coverageDir, 'backend', 'coverage-final.json');
  const frontendCoveragePath = path.join(coverageDir, 'frontend', 'coverage-final.json');

  let backendCoverage = {};
  let frontendCoverage = {};

  // Read backend coverage if it exists
  if (fs.existsSync(backendCoveragePath)) {
    try {
      backendCoverage = JSON.parse(fs.readFileSync(backendCoveragePath, 'utf8'));
      console.log('✅ Backend coverage report loaded');
    } catch (error) {
      console.log('⚠️  Could not read backend coverage report:', error.message);
    }
  } else {
    console.log('⚠️  Backend coverage report not found');
  }

  // Read frontend coverage if it exists
  if (fs.existsSync(frontendCoveragePath)) {
    try {
      frontendCoverage = JSON.parse(fs.readFileSync(frontendCoveragePath, 'utf8'));
      console.log('✅ Frontend coverage report loaded');
    } catch (error) {
      console.log('⚠️  Could not read frontend coverage report:', error.message);
    }
  } else {
    console.log('⚠️  Frontend coverage report not found');
  }

  // Merge coverage reports
  const mergedCoverage = { ...backendCoverage, ...frontendCoverage };

  // Calculate overall statistics
  const stats = {
    backend: calculateStats(backendCoverage),
    frontend: calculateStats(frontendCoverage),
    total: calculateStats(mergedCoverage)
  };

  // Generate HTML report
  const htmlReport = generateHTMLReport(stats, mergedCoverage);

  // Write HTML report
  const reportPath = path.join(coverageDir, 'index.html');
  fs.writeFileSync(reportPath, htmlReport);

  // Write merged JSON report
  const jsonReportPath = path.join(coverageDir, 'coverage-merged.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(mergedCoverage, null, 2));

  console.log('\n📊 Coverage Report Generated');
  console.log('========================');
  console.log(`📁 Report saved to: ${reportPath}`);
  console.log(`📄 JSON report: ${jsonReportPath}`);
  console.log('');
  console.log('Coverage Summary:');
  console.log('=================');
  console.log(`Backend:  ${stats.backend.lines.pct}% lines, ${stats.backend.functions.pct}% functions, ${stats.backend.branches.pct}% branches`);
  console.log(`Frontend: ${stats.frontend.lines.pct}% lines, ${stats.frontend.functions.pct}% functions, ${stats.frontend.branches.pct}% branches`);
  console.log(`Total:    ${stats.total.lines.pct}% lines, ${stats.total.functions.pct}% functions, ${stats.total.branches.pct}% branches`);
  console.log('');
  console.log('Open the HTML report in your browser for detailed coverage information.');
}

function calculateStats(coverage) {
  let totalLines = 0, coveredLines = 0;
  let totalFunctions = 0, coveredFunctions = 0;
  let totalBranches = 0, coveredBranches = 0;

  Object.values(coverage).forEach(file => {
    // Lines - count statements that were executed at least once
    if (file.s) {
      const statements = Object.keys(file.s).length;
      const executedStatements = Object.values(file.s).filter(count => count > 0).length;
      totalLines += statements;
      coveredLines += executedStatements;
    }

    // Functions - count functions that were called at least once
    if (file.f) {
      const functions = Object.keys(file.f).length;
      const calledFunctions = Object.values(file.f).filter(count => count > 0).length;
      totalFunctions += functions;
      coveredFunctions += calledFunctions;
    }

    // Branches - count branches that were taken at least once
    if (file.b) {
      Object.values(file.b).forEach(branch => {
        if (Array.isArray(branch)) {
          totalBranches += branch.length;
          coveredBranches += branch.filter(count => count > 0).length;
        }
      });
    }
  });

  // Handle case where no coverage data exists
  if (totalLines === 0 && totalFunctions === 0 && totalBranches === 0) {
    return {
      lines: { total: 0, covered: 0, pct: '0.00' },
      functions: { total: 0, covered: 0, pct: '0.00' },
      branches: { total: 0, covered: 0, pct: '0.00' }
    };
  }

  return {
    lines: {
      total: totalLines,
      covered: coveredLines,
      pct: totalLines > 0 ? ((coveredLines / totalLines) * 100).toFixed(2) : '0.00'
    },
    functions: {
      total: totalFunctions,
      covered: coveredFunctions,
      pct: totalFunctions > 0 ? ((coveredFunctions / totalFunctions) * 100).toFixed(2) : '0.00'
    },
    branches: {
      total: totalBranches,
      covered: coveredBranches,
      pct: totalBranches > 0 ? ((coveredBranches / totalBranches) * 100).toFixed(2) : '0.00'
    }
  };
}

function generateHTMLReport(stats, coverage) {
  const backendFiles = Object.keys(coverage).filter(file => file.includes('/backend/'));
  const frontendFiles = Object.keys(coverage).filter(file => file.includes('/frontend/'));

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MongoDB Client - Coverage Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5em;
            font-weight: 300;
        }
        .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 1.1em;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            padding: 30px;
        }
        .summary-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #667eea;
        }
        .summary-card h3 {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 1.2em;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .metric:last-child {
            border-bottom: none;
        }
        .metric-value {
            font-weight: bold;
            font-size: 1.1em;
        }
        .metric-label {
            color: #666;
        }
        .lines { color: #28a745; }
        .functions { color: #007bff; }
        .branches { color: #ffc107; }
        .files-section {
            padding: 30px;
        }
        .files-section h2 {
            color: #333;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .file-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        .file-item {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 15px;
            border: 1px solid #e9ecef;
        }
        .file-name {
            font-weight: 500;
            color: #333;
            margin-bottom: 8px;
            word-break: break-all;
            font-size: 0.9em;
        }
        .file-metrics {
            display: flex;
            gap: 15px;
            font-size: 0.85em;
        }
        .file-metric {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .file-metric-value {
            font-weight: bold;
            font-size: 1.1em;
        }
        .file-metric-label {
            color: #666;
            font-size: 0.8em;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px 30px;
            text-align: center;
            color: #666;
            border-top: 1px solid #e9ecef;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge.backend { background: #007bff; color: white; }
        .badge.frontend { background: #28a745; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MongoDB Client</h1>
            <p>Test Coverage Report</p>
        </div>

        <div class="summary">
            <div class="summary-card">
                <h3>Backend Coverage</h3>
                <div class="metric">
                    <span class="metric-label">Lines</span>
                    <span class="metric-value lines">${stats.backend.lines.pct}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Functions</span>
                    <span class="metric-value functions">${stats.backend.functions.pct}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Branches</span>
                    <span class="metric-value branches">${stats.backend.branches.pct}%</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>Frontend Coverage</h3>
                <div class="metric">
                    <span class="metric-label">Lines</span>
                    <span class="metric-value lines">${stats.frontend.lines.pct}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Functions</span>
                    <span class="metric-value functions">${stats.frontend.functions.pct}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Branches</span>
                    <span class="metric-value branches">${stats.frontend.branches.pct}%</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>Total Coverage</h3>
                <div class="metric">
                    <span class="metric-label">Lines</span>
                    <span class="metric-value lines">${stats.total.lines.pct}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Functions</span>
                    <span class="metric-value functions">${stats.total.functions.pct}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Branches</span>
                    <span class="metric-value branches">${stats.total.branches.pct}%</span>
                </div>
            </div>
        </div>

        ${backendFiles.length > 0 ? `
        <div class="files-section">
            <h2>Backend Files <span class="badge backend">Backend</span></h2>
            <div class="file-list">
                ${backendFiles.map(file => {
                    const data = coverage[file];
                    const relativePath = file.replace(/^.*\/backend\//, 'backend/');

                    // Calculate coverage for this file
                    const linesTotal = data.s ? Object.keys(data.s).length : 0;
                    const linesCovered = data.s ? Object.values(data.s).filter(count => count > 0).length : 0;
                    const linesPct = linesTotal > 0 ? Math.round((linesCovered / linesTotal) * 100) : 0;

                    const functionsTotal = data.f ? Object.keys(data.f).length : 0;
                    const functionsCovered = data.f ? Object.values(data.f).filter(count => count > 0).length : 0;
                    const functionsPct = functionsTotal > 0 ? Math.round((functionsCovered / functionsTotal) * 100) : 0;

                    const branchesTotal = data.b ? Object.values(data.b).reduce((sum, branch) => sum + (Array.isArray(branch) ? branch.length : 0), 0) : 0;
                    const branchesCovered = data.b ? Object.values(data.b).reduce((sum, branch) => sum + (Array.isArray(branch) ? branch.filter(count => count > 0).length : 0), 0) : 0;
                    const branchesPct = branchesTotal > 0 ? Math.round((branchesCovered / branchesTotal) * 100) : 0;

                    return `
                        <div class="file-item">
                            <div class="file-name">${relativePath}</div>
                            <div class="file-metrics">
                                <div class="file-metric">
                                    <div class="file-metric-value lines">${linesPct}%</div>
                                    <div class="file-metric-label">Lines</div>
                                </div>
                                <div class="file-metric">
                                    <div class="file-metric-value functions">${functionsPct}%</div>
                                    <div class="file-metric-label">Functions</div>
                                </div>
                                <div class="file-metric">
                                    <div class="file-metric-value branches">${branchesPct}%</div>
                                    <div class="file-metric-label">Branches</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        ` : ''}

        ${frontendFiles.length > 0 ? `
        <div class="files-section">
            <h2>Frontend Files <span class="badge frontend">Frontend</span></h2>
            <div class="file-list">
                ${frontendFiles.map(file => {
                    const data = coverage[file];
                    const relativePath = file.replace(/^.*\/frontend\//, 'frontend/');

                    // Calculate coverage for this file
                    const linesTotal = data.s ? Object.keys(data.s).length : 0;
                    const linesCovered = data.s ? Object.values(data.s).filter(count => count > 0).length : 0;
                    const linesPct = linesTotal > 0 ? Math.round((linesCovered / linesTotal) * 100) : 0;

                    const functionsTotal = data.f ? Object.keys(data.f).length : 0;
                    const functionsCovered = data.f ? Object.values(data.f).filter(count => count > 0).length : 0;
                    const functionsPct = functionsTotal > 0 ? Math.round((functionsCovered / functionsTotal) * 100) : 0;

                    const branchesTotal = data.b ? Object.values(data.b).reduce((sum, branch) => sum + (Array.isArray(branch) ? branch.length : 0), 0) : 0;
                    const branchesCovered = data.b ? Object.values(data.b).reduce((sum, branch) => sum + (Array.isArray(branch) ? branch.filter(count => count > 0).length : 0), 0) : 0;
                    const branchesPct = branchesTotal > 0 ? Math.round((branchesCovered / branchesTotal) * 100) : 0;

                    return `
                        <div class="file-item">
                            <div class="file-name">${relativePath}</div>
                            <div class="file-metrics">
                                <div class="file-metric">
                                    <div class="file-metric-value lines">${linesPct}%</div>
                                    <div class="file-metric-label">Lines</div>
                                </div>
                                <div class="file-metric">
                                    <div class="file-metric-value functions">${functionsPct}%</div>
                                    <div class="file-metric-label">Functions</div>
                                </div>
                                <div class="file-metric">
                                    <div class="file-metric-value branches">${branchesPct}%</div>
                                    <div class="file-metric-label">Branches</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        ` : ''}

        <div class="footer">
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
}

if (require.main === module) {
  generateCoverageReport();
}

module.exports = { generateCoverageReport };