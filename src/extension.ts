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

      function foundAndPrepareDefinitionsAndReferences(defPattern: RegExp, refPattern: RegExp, definitionType: string, referenceType: string) {
        try {
          // Found all the definitions
          const definitions = new Set<string>();

          lines.forEach((line, lineIndex) => {
            const match = line.match(defPattern);

            // If found a definition
            if (match) {
              const name = match[1];

              definitions.add(name);
              
              // Color the token
              const startChar = line.indexOf(match[1]);

              tokensBuilder.push(new vscode.Range(lineIndex, startChar, lineIndex, startChar + match[1].length), definitionType);
            }
          });

          // Found all the references
          lines.forEach((line, lineIndex) => {
            // Skip definitions
            if (defPattern.test(line)) {
              return;
            }

            // Skip comments
            const commentIndex = line.indexOf(';');
            const hashCommentIndex = line.indexOf('#');

            const firstCommentIndex = Math.min(
              commentIndex === -1 ? Infinity : commentIndex,
              hashCommentIndex === -1 ? Infinity : hashCommentIndex
            );

            const codepart = firstCommentIndex === Infinity ? line : line.substring(0, firstCommentIndex);

            let match;
            refPattern.lastIndex = 0;

            while ((match = refPattern.exec(codepart)) !== null) {
              const identifier = match[1];
              
              // If found the reference
              if (definitions.has(identifier)) {
                tokensBuilder.push(new vscode.Range(lineIndex, match.index, lineIndex, match.index + match[1].length), referenceType);
              }
            }
          });
        } catch (error) {
          console.error("[Assembly][Error] " + error);
        }
      }

      foundAndPrepareDefinitionsAndReferences(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'labelDefinition', 'labelReference');
      foundAndPrepareDefinitionsAndReferences(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+([eE][qQ][uU])\b/, /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, 'variableDefinition', 'variableReference');

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