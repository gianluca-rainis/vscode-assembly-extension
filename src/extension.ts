import * as vscode from 'vscode';

const tokenTypes = ['labelDefinition', 'labelReference'];
const tokenModifiers: string[] = [];
const legend = new vscode.SemanticTokensLegend(tokenTypes, tokenModifiers);

const provider: vscode.DocumentSemanticTokensProvider = {
	provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
    try {
      const tokensBuilder = new vscode.SemanticTokensBuilder(legend);
      const text = document.getText();
      const lines = text.split('\n');

      console.log("[Assembly][Debug] Provide Semantic Tokens Started");

      // Found all the label definitions
      const definedLabels = new Set<string>();
      const labelDefPattern = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/;

      lines.forEach((line, lineIndex) => {
        const match = line.match(labelDefPattern);

        // If found a definition
        if (match) {
          const labelName = match[1].toLowerCase();

          definedLabels.add(labelName);
          
          // Color the label token
          const startChar = line.indexOf(match[1]);

          tokensBuilder.push(
            new vscode.Range(lineIndex, startChar, lineIndex, startChar + match[1].length),
            'labelDefinition'
          );
        }
      });

      // Found all the references to the labels
      const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;

      lines.forEach((line, lineIndex) => {
        // Skip label definitions
        if (labelDefPattern.test(line)) {
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
        identifierPattern.lastIndex = 0;

        while ((match = identifierPattern.exec(codepart)) !== null) {
          const identifier = match[1].toLowerCase();
          
          // If found the label
          if (definedLabels.has(identifier)) {
            tokensBuilder.push(
              new vscode.Range(lineIndex, match.index, lineIndex, match.index + match[1].length),
              'labelReference'
            );
          }
        }
      });

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