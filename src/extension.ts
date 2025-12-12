import * as vscode from 'vscode';

const tokenTypes = ['labelDefinition', 'labelReference', 'variableDefinition', 'variableReference'];
const tokenModifiers: string[] = [];
const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

const provider: vscode.DocumentSemanticTokensProvider = {
	provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
    try {
      const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
      const text = document.getText();
      const lines = text.split('\n');

      console.log("[Assembly][Debug] Provide Semantic Tokens Started");

      function foundAndPrepareDefinitionsAndReferences(defPattern: RegExp, refPattern: RegExp, definitionType: string, referenceType: string, skipNumbers: boolean = false) {
        try {
          // Found all the definitions
          const definitions = new Set<string>();

          lines.forEach((line, lineIndex) => {
            // Build codepart excluding comments for definition parsing
            const commentIndex = line.indexOf(';');
            const hashCommentIndex = line.indexOf('#');
            const firstCommentIndex = Math.min(
              commentIndex === -1 ? Infinity : commentIndex,
              hashCommentIndex === -1 ? Infinity : hashCommentIndex
            );

            const codepart = firstCommentIndex === Infinity ? line : line.substring(0, firstCommentIndex);

            // Precompute string ranges to ignore definitions inside strings
            const stringRanges: Array<{start: number, end: number}> = [];
            const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
            let sMatch;

            while ((sMatch = stringRegex.exec(codepart)) !== null) {
              stringRanges.push({ start: sMatch.index, end: sMatch.index + sMatch[0].length });
            }

            defPattern.lastIndex = 0;

            // Use match for non-global patterns, exec for global patterns, within codepart
            if (defPattern.global) {
              let match: any;
              while ((match = defPattern.exec(codepart)) !== null) {
                const name = match[1];

                if (!name || typeof name !== 'string') {
                  continue;
                }

                // Skip numbers for directive-style definitions if requested
                if (skipNumbers && /^(0x[0-9a-fA-F]+|[0-9]+h?|0b[01]+|0o[0-7]+|\d+)$/i.test(name)) {
                  continue;
                }

                // Ignore matches inside strings
                const insideString = stringRanges.some(r => match.index >= r.start && match.index < r.end);

                if (insideString) {
                  continue;
                }

                definitions.add(name);

                const identifierStartInMatch = match[0].indexOf(name);

                if (identifierStartInMatch === -1) {
                  continue;
                }

                const startChar = match.index + identifierStartInMatch;

                tokensBuilder.push(new vscode.Range(lineIndex, startChar, lineIndex, startChar + name.length), definitionType);
              }
            } else {
              const match = codepart.match(defPattern);

              if (match) {
                const name = match[1];

                if (!name || typeof name !== 'string') {
                  return;
                }

                if (skipNumbers && /^(0x[0-9a-fA-F]+|[0-9]+h?|0b[01]+|0o[0-7]+|\d+)$/i.test(name)) {
                  return;
                }

                // Check position not inside string
                const mIndex = codepart.indexOf(match[0]);
                const insideString = stringRanges.some(r => mIndex >= r.start && mIndex < r.end);

                if (insideString) {
                  return;
                }

                definitions.add(name);
                
                const startChar = codepart.indexOf(name);

                tokensBuilder.push(new vscode.Range(lineIndex, startChar, lineIndex, startChar + name.length), definitionType);
              }
            }
          });

          // Found all the references
          lines.forEach((line, lineIndex) => {
            // Skip comments
            const commentIndex = line.indexOf(';');
            const hashCommentIndex = line.indexOf('#');

            const firstCommentIndex = Math.min(
              commentIndex === -1 ? Infinity : commentIndex,
              hashCommentIndex === -1 ? Infinity : hashCommentIndex
            );

            const codepart = firstCommentIndex === Infinity ? line : line.substring(0, firstCommentIndex);

            // Find all string ranges to exclude from matching
            const stringRanges: Array<{start: number, end: number}> = [];
            const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
            let stringMatch;
            
            while ((stringMatch = stringRegex.exec(codepart)) !== null) {
              stringRanges.push({ 
                start: stringMatch.index, 
                end: stringMatch.index + stringMatch[0].length 
              });
            }

            // Find references, excluding those inside strings
            let refMatch: any;
            refPattern.lastIndex = 0;

            while ((refMatch = refPattern.exec(codepart)) !== null) {
              const identifier = refMatch[1];
              
              // Check if the match is inside any string
              const isInsideString = stringRanges.some(range => 
                refMatch.index >= range.start && refMatch.index < range.end
              );
              
              // If found the reference and it's not inside a string
              if (definitions.has(identifier) && !isInsideString) {
                tokensBuilder.push(new vscode.Range(lineIndex, refMatch.index, lineIndex, refMatch.index + identifier.length), referenceType);
              }
            }
          });
        } catch (error) {
          console.error("[Assembly][Error][Provide Semantic Tokens] " + error);
        }
      }

      function handleMacroParams() {
        try {
          // Handle MACRO parameters
          const macroDefinitions = new Set<string>();

          lines.forEach((line, lineIndex) => {
            // Skip comments when detecting MACRO definitions
            const commentIndex = line.indexOf(';');
            const hashCommentIndex = line.indexOf('#');
            const firstCommentIndex = Math.min(
              commentIndex === -1 ? Infinity : commentIndex,
              hashCommentIndex === -1 ? Infinity : hashCommentIndex
            );
            
            const codepart = firstCommentIndex === Infinity ? line : line.substring(0, firstCommentIndex);

            const macroMatch = codepart.match(/^\s*MACRO\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(.*)/i);

            if (macroMatch) {
              // Parse macro parameters (comma-separated)
              const paramsStr = macroMatch[2].trim();

              if (paramsStr) {
                const params = paramsStr.split(',').map(p => p.trim()).filter(p => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p));
                
                params.forEach(param => {
                  macroDefinitions.add(param);
                  
                  // Color the parameter in the MACRO line
                  const paramIndex = codepart.indexOf(param, codepart.indexOf('MACRO'));

                  if (paramIndex !== -1) {
                    tokensBuilder.push(new vscode.Range(lineIndex, paramIndex, lineIndex, paramIndex + param.length), 'variableDefinition');
                  }
                });
              }
            }
          });

          // Find references to macro parameters
          lines.forEach((line, lineIndex) => {
            // Skip comment lines
            const commentIndex = line.indexOf(';');
            const hashCommentIndex = line.indexOf('#');
            const firstCommentIndex = Math.min(
              commentIndex === -1 ? Infinity : commentIndex,
              hashCommentIndex === -1 ? Infinity : hashCommentIndex
            );
            
            const codepart = firstCommentIndex === Infinity ? line : line.substring(0, firstCommentIndex);

            // Skip MACRO definition lines
            if (/^\s*MACRO\s+/i.test(codepart)) {
              return;
            }

            // Find all string ranges to exclude
            const stringRanges: Array<{start: number, end: number}> = [];
            const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
            let stringMatch;
            
            while ((stringMatch = stringRegex.exec(codepart)) !== null) {
              stringRanges.push({ 
                start: stringMatch.index, 
                end: stringMatch.index + stringMatch[0].length 
              });
            }

            // Find macro parameter references
            const refPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
            let refMatch: any;
            
            while ((refMatch = refPattern.exec(codepart)) !== null) {
              const identifier = refMatch[1];
              
              // Check if inside string
              const isInsideString = stringRanges.some(range => 
                refMatch.index >= range.start && refMatch.index < range.end
              );
              
              if (macroDefinitions.has(identifier) && !isInsideString) {
                tokensBuilder.push(new vscode.Range(lineIndex, refMatch.index, lineIndex, refMatch.index + identifier.length), 'variableReference');
              }
            }
          });
        } catch (error) {
          console.error("[Assembly][Error][Provide Semantic Tokens] " + error);
        }
      }

      foundAndPrepareDefinitionsAndReferences(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'labelDefinition', 'labelReference');
      foundAndPrepareDefinitionsAndReferences(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+([eE][qQ][uU])\b/, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'variableDefinition', 'variableReference');
      foundAndPrepareDefinitionsAndReferences(/(?:^|\s)(?:include|seek|extern|public|define|section|defc|defs|defm|defw|defgroup|defvars|macro)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'variableDefinition', 'variableReference', true);
      foundAndPrepareDefinitionsAndReferences(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/g, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'variableDefinition', 'variableReference');
      foundAndPrepareDefinitionsAndReferences(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+DS\.[BWLD]/gi, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'variableDefinition', 'variableReference');
      handleMacroParams();

      return tokensBuilder.build();
    } catch (error) {
      console.error("[Assembly][Error] " + error);
      return null;
    }
	}
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const selector = { language: 'assembly', scheme: 'file' };

  console.log("[Assembly][Debug] Assembly Extension Active");
	
	// Register the Semantic Token Provider for Assembly
  try {
    vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, legend);
  } catch (error) {
    console.error("[Assembly][Error] " + error);
  }
}

export function deactivate() {}