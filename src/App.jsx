import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { Upload, Download, Plus, Trash2, Clipboard, AlertCircle, FileText, ChevronRight } from 'lucide-react';

// --- Data & Helper Functions ---

const initialCsvData = `CID,Criterion,Weight,Score,Maturity L1 (Non-Existent),Maturity L2 (Reactive/Manual),Maturity L3 (Defined/Policy)
1,Overall Quality,70%,,,,,
2,Support,30%,,,,,
1.1,Functionality,40%,,,,,
1.2,Usability,30%,,,,,
1.3,Reliability,30%,,,,,
1.1.1,Feature Set,50%,,Level 1,Level 2,
1.1.2,Performance,50%,,Basic,
1.2.1,Ease of Use,50%,,Simple,Usable,Expert
1.2.2,Documentation,50%,70%,Exists,
2.1,Response Time,50%,,SLA Met,
2.2,Problem Resolution,50%,,Resolved,`;

const parsePercentage = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const sValue = String(value).replace('%', '').trim();
  if (sValue === '') return 0;
  const num = parseFloat(sValue);
  if (isNaN(num)) return 0;
  return num > 1 ? num / 100 : num;
};

const formatPercentage = (decimal, precision = 0) => {
  if (decimal === undefined || isNaN(decimal)) return '';
  return `${(decimal * 100).toFixed(precision)}%`;
};

const getAcronym = (name) => {
  if (!name) return '';
  const words = name.split(' ');
  if (words.length > 1) {
    return words.slice(0, 3).map(word => word[0]).join('').toUpperCase();
  } else {
    return name.substring(0, 3).toUpperCase();
  }
};

const naturalSort = (a, b) => {
  return String(a.CID).localeCompare(String(b.CID), undefined, { numeric: true, sensitivity: 'base' });
};

// --- D3 Chart Component ---

const SunburstChart = ({ data, onPathClick }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current || !containerRef.current) return;

    // 1. Setup Dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const radius = Math.min(width, height) / 2.2; 

    // 2. Prepare Hierarchy
    const rootData = { name: "root", children: [] };
    const nodeMap = { 'root': rootData };
    
    // First pass: create nodes
    data.forEach(d => {
      nodeMap[d.CID] = {
        ...d,
        name: d.Criterion || d.CID,
        weight: d['Calculated Weights'],
        score: d.Score,
        children: []
      };
    });

    // Second pass: link parents
    data.forEach(d => {
      const node = nodeMap[d.CID];
      const cid = String(d.CID);
      const lastDotIndex = cid.lastIndexOf('.');
      if (lastDotIndex > -1) {
        const parentCid = cid.substring(0, lastDotIndex);
        const parent = nodeMap[parentCid];
        if (parent) parent.children.push(node);
        else rootData.children.push(node);
      } else {
        rootData.children.push(node);
      }
    });

    const hierarchy = d3.hierarchy(rootData);

    // 3. Calculate "Absolute Weights"
    hierarchy.data.absoluteWeight = 1.0;
    hierarchy.eachBefore(node => {
      if (node.parent) {
        node.data.absoluteWeight = node.parent.data.absoluteWeight * (node.data.weight || 0);
      }
    });
    
    hierarchy.sum(d => (d.children && d.children.length) ? 0 : d.absoluteWeight);
    hierarchy.sort((a, b) => b.value - a.value);

    // 4. Scales
    const x = d3.scaleLinear().range([0, 2 * Math.PI]);
    const y = d3.scaleSqrt().range([0, radius]);
    const color = d3.scaleSequential([0, 1], d3.interpolateRdYlGn);

    const partition = d3.partition();
    const arc = d3.arc()
      .startAngle(d => Math.max(0, Math.min(2 * Math.PI, x(d.x0))))
      .endAngle(d => Math.max(0, Math.min(2 * Math.PI, x(d.x1))))
      .innerRadius(d => Math.max(0, y(d.y0)))
      .outerRadius(d => Math.max(0, y(d.y1)));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); 

    svg.attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`)
       .style("font", "12px sans-serif");

    const root = partition(hierarchy);
    const g = svg.append("g");

    const path = g.append("g")
      .selectAll("path")
      .data(root.descendants().filter(d => d.depth)) 
      .join("path")
      .attr("fill", d => d.data.score === undefined ? '#ccc' : color(d.data.score))
      .attr("d", arc)
      .style("cursor", "pointer")
      .attr("stroke", "#fff")
      .attr("stroke-width", "1px");

    const label = g.append("g")
      .attr("pointer-events", "none")
      .attr("text-anchor", "middle")
      .style("user-select", "none")
      .selectAll("text")
      .data(root.descendants().filter(d => d.depth))
      .join("text")
      .attr("dy", "0.35em")
      .attr("fill", "white")
      .style("text-shadow", "0 0 3px black")
      .style("font-weight", "bold")
      .text(d => getAcronym(d.data.name))
      .attr("transform", d => {
          const x0 = x(d.x0);
          const x1 = x(d.x1);
          const y0 = y(d.y0);
          const y1 = y(d.y1);
          if (!y0) return "";
          const rot = (x0 + x1) / 2 * 180 / Math.PI;
          const transY = (y0 + y1) / 2;
          return `rotate(${rot - 90}) translate(${transY},0) rotate(${rot < 180 ? 0 : 180})`;
      })
      .attr("display", d => {
          const x0 = x(d.x0);
          const x1 = x(d.x1);
          const y0 = y(d.y0);
          const y1 = y(d.y1);
          const arcWidth = (x1 - x0) * (y0 + y1) / 2;
          return arcWidth > 12 ? "inline" : "none";
      });

    const centerText = g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("font-size", "24px")
      .style("font-weight", "bold")
      .style("fill", "#374151")
      .style("filter", "drop-shadow(0px 1px 1px rgba(0,0,0,0.2))")
      .style("cursor", "pointer")
      .text(formatPercentage(root.data.score, 1))
      .on("click", (event) => click(event, root)); 

    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("opacity", 0);

    path.on("mouseover", (event, d) => {
      tooltip.transition().duration(200).style("opacity", .9);
      const parentName = d.parent ? (d.parent.data.name === 'root' ? 'Total' : d.parent.data.name) : 'Total';
      tooltip.html(`
        <strong>${d.data.name}</strong><br/>
        CID: ${d.data.CID}<br/>
        Score: ${formatPercentage(d.data.score)}<br/>
        Weight: ${formatPercentage(d.data.weight)} (of ${parentName})
      `)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", () => {
      tooltip.transition().duration(500).style("opacity", 0);
    })
    .on("click", click);

    function click(event, p) {
      const target = p.children ? p : p.parent || root;
      
      svg.transition().duration(750).tween("scale", () => {
        const xd = d3.interpolate(x.domain(), [target.x0, target.x1]);
        const yd = d3.interpolate(y.domain(), [target.y0, 1]);
        const yr = d3.interpolate(y.range(), [target.y0 ? 20 : 0, radius]);
        
        return t => { 
          x.domain(xd(t)); 
          y.domain(yd(t)).range(yr(t)); 
        };
      })
      .selectAll("path")
      .attrTween("d", d => () => arc(d));

      centerText.text(formatPercentage(target.data.score, 1))
                .style("fill", color(target.data.score));
      
      label.transition().duration(750)
        .attrTween("transform", d => () => {
            const x0 = x(d.x0);
            const x1 = x(d.x1);
            const y0 = y(d.y0);
            const y1 = y(d.y1);
            if (!y0) return "";
            const rot = (x0 + x1) / 2 * 180 / Math.PI;
            const transY = (y0 + y1) / 2;
            return `rotate(${rot - 90}) translate(${transY},0) rotate(${rot < 180 ? 0 : 180})`;
        })
        .styleTween("display", d => () => {
             const x0 = x(d.x0);
             const x1 = x(d.x1);
             const y0 = y(d.y0);
             const y1 = y(d.y1);
             if (x1 <= x0 || y0 >= y1) return "none";
             const arcWidth = (x1 - x0) * (y0 + y1) / 2;
             return arcWidth > 12 ? "inline" : "none";
        });
    }

    return () => {
      tooltip.remove();
    };
  }, [data]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      <svg ref={svgRef} width="100%" height="100%"></svg>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [data, setData] = useState([]);
  const [maturityHeaders, setMaturityHeaders] = useState([]);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    processRawData(d3.csvParse(initialCsvData));
  }, []);

  const calculateHierarchyScores = (flatData) => {
    const nodeMap = {};
    const rootChildren = [];
    const processedData = flatData.map(d => ({...d, children: []}));
    processedData.forEach(d => nodeMap[d.CID] = d);

    processedData.forEach(d => {
      const lastDot = String(d.CID).lastIndexOf('.');
      if (lastDot > -1) {
        const parentCid = String(d.CID).substring(0, lastDot);
        if (nodeMap[parentCid]) {
          nodeMap[parentCid].children.push(d);
        } else {
           rootChildren.push(d);
        }
      } else {
        rootChildren.push(d);
      }
    });

    const calculateScore = (node) => {
        if (!node.children || node.children.length === 0) {
            return node.Score; 
        }

        let weightedSum = 0;
        let weightTotal = 0;

        node.children.forEach(child => {
            const childScore = calculateScore(child);
            const childWeight = child['Calculated Weights'] || 0;
            if (childScore !== undefined && childScore !== null && !isNaN(childScore)) {
                weightedSum += childScore * childWeight;
                weightTotal += childWeight;
            }
        });
        node.Score = weightedSum;
        return node.Score;
    };

    rootChildren.forEach(root => calculateScore(root));
    return processedData.sort((a, b) => naturalSort(a, b));
  };

  const processRawData = (parsedData) => {
    try {
        const columns = parsedData.columns;
        
        // Find core columns by fuzzy matching
        const findCol = (terms) => columns.find(c => terms.some(t => c.toLowerCase().trim() === t));
        
        const cidCol = findCol(['cid', 'id']) || columns[0];
        const critCol = findCol(['criterion', 'criteria', 'name']) || columns[1];
        const weightCol = findCol(['calculated weights', 'weights', 'weight']) || columns[2];
        const scoreCol = findCol(['score', 'current score']) || columns[3];
        
        const standardCols = [cidCol, critCol, weightCol, scoreCol];
        
        // Store the actual headers for maturity columns to render in table
        const detectedMaturityHeaders = columns.filter(c => !standardCols.includes(c));
        setMaturityHeaders(detectedMaturityHeaders);

        const formatted = parsedData.map(d => {
            // Map values to the detected headers
            const rowMaturities = detectedMaturityHeaders.map(header => d[header]);
            
            return {
                CID: d[cidCol] || '',
                Criterion: d[critCol] || '',
                'Calculated Weights': parsePercentage(d[weightCol]),
                Score: parsePercentage(d[scoreCol]), 
                maturities: rowMaturities,
                selectedMaturityIndex: -1 
            };
        });
        
        const calculated = calculateHierarchyScores(formatted);
        setData(calculated);
    } catch (err) {
        console.error(err);
        setErrorMsg("Failed to process data. Ensure CSV format is correct.");
    }
  };

  const handleMaturityClick = (rowIndex, maturityIndex, totalMaturities, maturityText) => {
    const newData = [...data];
    const row = newData[rowIndex];
    
    const isNo = String(maturityText).trim().toLowerCase() === 'no';
    let newScore = 0;

    if (!isNo) {
        const currentMaturities = row.maturities;
        
        // 1. Calculate Denominator: Count valid options (not "No", not empty)
        const valueOptionCount = currentMaturities.filter(m => {
            const txt = String(m).trim().toLowerCase();
            return txt !== 'no' && txt !== '';
        }).length;
        
        // 2. Calculate Rank: Position of clicked item relative to non-No items
        let rank = 0;
        for (let i = 0; i <= maturityIndex; i++) {
             const textAtIndex = currentMaturities[i];
             const txt = String(textAtIndex).trim().toLowerCase();
             if (txt !== 'no' && txt !== '') {
                 rank++;
             }
        }
        
        newScore = valueOptionCount > 0 ? rank / valueOptionCount : 0;
    }

    if (row.selectedMaturityIndex === maturityIndex) {
        row.selectedMaturityIndex = -1;
        row.Score = undefined; 
    } else {
        row.selectedMaturityIndex = maturityIndex;
        row.Score = newScore;
    }

    const recalculated = calculateHierarchyScores(newData);
    setData(recalculated);
  };
  
  const handleInputChange = (rowIndex, field, value) => {
      const newData = [...data];
      if (field === 'Calculated Weights') {
          newData[rowIndex][field] = parsePercentage(value);
          const recalculated = calculateHierarchyScores(newData);
          setData(recalculated);
      } else {
          newData[rowIndex][field] = value;
          setData(newData);
      }
  };

  const addRow = () => {
      setData([...data, { 
          CID: '', 
          Criterion: '', 
          'Calculated Weights': 0, 
          Score: 0, 
          maturities: new Array(maturityHeaders.length).fill(""),
          selectedMaturityIndex: -1
      }]);
  };

  const deleteRow = (index) => {
      const newData = data.filter((_, i) => i !== index);
      const recalculated = calculateHierarchyScores(newData);
      setData(recalculated);
  };

  const handlePaste = () => {
      try {
          let parsed;
          if (pasteText.includes('\t')) {
              parsed = d3.tsvParse(pasteText);
          } else {
              parsed = d3.csvParse(pasteText);
          }
          
          if (!parsed.columns || parsed.columns.length < 2) throw new Error("Invalid CSV/TSV");
          processRawData(parsed);
          setPasteModalOpen(false);
          setPasteText("");
          setErrorMsg("");
      } catch (err) {
          setErrorMsg("Failed to parse data. Check format.");
      }
  };

  const saveJson = () => {
      const exportObject = {
          maturityHeaders,
          data
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "maturity_survey.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const loadJson = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const jsonImport = JSON.parse(e.target.result);
              let loadedData = [];
              if (Array.isArray(jsonImport)) {
                  loadedData = jsonImport;
                  const maxLen = loadedData.reduce((max, d) => Math.max(max, d.maturities ? d.maturities.length : 0), 0);
                  const inferredHeaders = Array.from({length: maxLen}, (_, i) => `Maturity ${i+1}`);
                  setMaturityHeaders(inferredHeaders);
              } else if (jsonImport.data && jsonImport.maturityHeaders) {
                  loadedData = jsonImport.data;
                  setMaturityHeaders(jsonImport.maturityHeaders);
              }

              const recalculated = calculateHierarchyScores(loadedData);
              setData(recalculated);
          } catch (err) {
              setErrorMsg("Error parsing JSON file");
          }
      };
      reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-800 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex-none bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm z-10">
        <div>
            <h1 className="text-2xl font-bold text-gray-900">Maturity Sunburst SPA</h1>
            <p className="text-sm text-gray-500">Interactive Assessment Tool</p>
        </div>
        <div className="flex gap-2">
            <button onClick={saveJson} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition shadow">
                <Download size={16} /> Save JSON
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition shadow cursor-pointer">
                <Upload size={16} /> Load JSON
                <input type="file" className="hidden" accept=".json" onChange={loadJson} />
            </label>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Pane: Chart (1/3) */}
        <div className="w-1/3 border-r border-gray-200 bg-white relative p-4 flex flex-col">
           <div className="flex-1 relative">
             <SunburstChart data={data} />
           </div>
        </div>

        {/* Right Pane: Table (2/3) */}
        <div className="w-2/3 flex flex-col bg-gray-50 h-full">
           {/* Toolbar */}
           <div className="flex-none p-4 bg-white border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                  <Clipboard size={18}/> Survey Questions
              </h2>
              <div className="flex gap-2">
                  <button onClick={() => setPasteModalOpen(!pasteModalOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                      <FileText size={14} /> Paste CSV
                  </button>
                  <button onClick={addRow} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                      <Plus size={14} /> Add Row
                  </button>
              </div>
           </div>

           {/* Paste Drawer */}
           {pasteModalOpen && (
               <div className="flex-none p-4 bg-gray-100 border-b border-gray-200">
                   <textarea 
                       className="w-full h-32 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                       placeholder="Paste CSV content here..."
                       value={pasteText}
                       onChange={(e) => setPasteText(e.target.value)}
                   />
                   <div className="mt-2 flex justify-end gap-2">
                       <button onClick={() => setPasteModalOpen(false)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                       <button onClick={handlePaste} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Import</button>
                   </div>
               </div>
           )}

           {/* Error Message */}
           {errorMsg && (
               <div className="flex-none p-2 bg-red-100 text-red-700 flex items-center gap-2 text-sm px-4">
                   <AlertCircle size={14} /> {errorMsg}
               </div>
           )}

           {/* Table Container */}
           <div className="flex-1 p-4 min-h-0 overflow-hidden">
             <div className="bg-white rounded-lg shadow border border-gray-200 h-full flex flex-col">
                <div className="flex-1 overflow-auto w-full">
                    <table className="min-w-full text-sm text-left border-collapse">
                        <thead className="bg-[#0880f7] text-white">
                            <tr>
                                <th className="px-4 py-2 w-16 sticky top-0">CID</th>
                                <th className="px-4 py-2 min-w-[200px] sticky top-0">Criterion</th>
                                <th className="px-4 py-2 w-20 sticky top-0">Weight</th>
                                <th className="px-4 py-2 w-20 sticky top-0">Score</th>
                                {maturityHeaders.map((header, i) => (
                                    <th key={i} className="px-4 py-2 sticky top-0 text-center min-w-[100px] whitespace-normal">
                                        {header}
                                    </th>
                                ))}
                                <th className="px-2 py-2 w-10 sticky top-0"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.map((row, rowIndex) => {
                                const isParent = row.children && row.children.length > 0;
                                return (
                                    <tr key={rowIndex} className="hover:bg-gray-50">
                                        <td className="p-1 align-middle">
                                            <input 
                                                type="text" 
                                                value={row.CID} 
                                                onChange={(e) => handleInputChange(rowIndex, 'CID', e.target.value)}
                                                className="w-full px-2 py-1 border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent rounded"
                                            />
                                        </td>
                                        <td className="p-1 align-middle">
                                            <input 
                                                type="text" 
                                                value={row.Criterion} 
                                                onChange={(e) => handleInputChange(rowIndex, 'Criterion', e.target.value)}
                                                className="w-full px-2 py-1 border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent rounded"
                                            />
                                        </td>
                                        <td className="p-1 align-middle">
                                            <input 
                                                type="text" 
                                                value={formatPercentage(row['Calculated Weights'], 1)} 
                                                onChange={(e) => handleInputChange(rowIndex, 'Calculated Weights', e.target.value)}
                                                className="w-full px-2 py-1 border-transparent hover:border-gray-300 focus:border-blue-500 bg-transparent rounded text-right"
                                            />
                                        </td>
                                        <td className={`p-2 align-middle text-right font-mono ${isParent ? 'bg-gray-100 text-gray-500' : 'text-gray-800'}`}>
                                            {formatPercentage(row.Score, 0)}
                                        </td>
                                        
                                        {maturityHeaders.map((_, mIndex) => {
                                            const matText = row.maturities && row.maturities[mIndex];
                                            if (isParent || !matText) return <td key={mIndex} className="bg-gray-50"></td>;
                                            
                                            const isActive = row.selectedMaturityIndex === mIndex;
                                            
                                            return (
                                                <td key={mIndex} className="p-1 align-middle">
                                                    <button
                                                        onClick={() => handleMaturityClick(rowIndex, mIndex, row.maturities.length, matText)}
                                                        className={`w-full py-2 px-2 rounded text-xs transition-colors border whitespace-normal h-full min-h-[32px] ${
                                                            isActive 
                                                            ? 'bg-blue-600 text-white border-blue-700 shadow-inner font-semibold' 
                                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {matText}
                                                    </button>
                                                </td>
                                            );
                                        })}

                                        <td className="p-1 align-middle text-center">
                                            <button onClick={() => deleteRow(rowIndex)} className="text-gray-400 hover:text-red-600 transition">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}