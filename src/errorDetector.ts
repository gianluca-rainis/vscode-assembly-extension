import * as vscode from 'vscode';

export class ErrorDetector {
    private context: vscode.ExtensionContext;
    public readonly langVersion: string; // Z80 - x86-64 - arm

    private readonly typesOfUsage = {
        AnyString: 0,
        AnyVariable: 1,
        AnyLabel: 2,
        Any8BitNumber: 3,
        Any16BitNumber: 4,
        AnySigned16BitNumber: 5,
    };

    private readonly usageLegend: Record<string, Array<any>> = {
        'r': ['A', 'B', 'C', 'D', 'E', 'H', 'L'],
        'dd': ['BC', 'DE', 'HL', 'SP'],
        'qq': ['BC', 'DE', 'HL', 'AF'],
        'ss': ['BC', 'DE', 'HL', 'SP'],
        'pp': ['BC', 'DE', 'IX', 'SP'],
        'rr': ['BC', 'DE', 'IY', 'SP'],
        'xx': ['HL', 'IX', 'IY'],

        'nn': [this.typesOfUsage.Any8BitNumber],
        'nnnn': [this.typesOfUsage.Any16BitNumber],
        'addr': [this.typesOfUsage.Any16BitNumber, this.typesOfUsage.AnyLabel],
        'ee': [this.typesOfUsage.AnySigned16BitNumber, this.typesOfUsage.AnyLabel],

        'cc': ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'],

        'b': ['0', '1', '2', '3', '4', '5', '6', '7'],
        's': [this.typesOfUsage.Any8BitNumber],

        'd': ['IX', 'IY', 'BC', 'DE', 'HL', 'AF'],
        'str': [this.typesOfUsage.AnyString],
        'var': [this.typesOfUsage.AnyVariable],
        'func': [this.typesOfUsage.AnyLabel],
    };

    // Assembler usage rules
    private readonly usageRulesAssembler: Record<string, Array<string>> = {
        'INCLUDE': ['include %str'],
        'EXTERN': ['extern %var'],
        'SECTION': ['section %var'],
        'PUBLIC': ['public %func'],
    };

    // Z80 commands usage rules
    private readonly usageRulesZ80: Record<string, Array<string>> = {
        'POP': ['pop %d'],
        'HALT': ['halt'],
        'IM': ['im %[0 1 2]'],
    };

    constructor(context: vscode.ExtensionContext, langVersion: string) {
        this.context = context;
        this.langVersion = langVersion;
    }

    private getCodePart(line: string): string {
        try {
            const comment1 = line.indexOf(';');
            const comment2 = line.indexOf('#');
            const first = Math.min(comment1 === -1 ? Infinity : comment1, comment2 === -1 ? Infinity : comment2);

            return first === Infinity ? line : line.substring(0, first);
        } catch (error) {
            console.error("[Assembly][Error][Error Detector] " + error);
            return "";
        }
    }

    private isInsideString(code: string, index: number, length: number, stringRegex: RegExp): boolean {
        try {
            let matches;
            stringRegex.lastIndex = 0;

            while ((matches = stringRegex.exec(code)) !== null) {
                const start = matches.index;
                const end = matches.index + matches[0].length;

                if (index >= start && (index + length) <= end) {
                    return true;
                }
            }
        } catch (error) {
            console.error("[Assembly][Error][Error Detector] " + error);
        }

        return false;
    }

    public async validate(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): Promise<void> {
        try {
            console.log("[Assembly][Debug] Assembly Error Detector Started");

            if (document.languageId !== 'assembly') {
                return;
            }

            const text = document.getText();
            const lines = text.split('\n');

            const diags: vscode.Diagnostic[] = [];
            const labels = new Map<string, number[]>();
            const variables = new Map<string, number[]>();
            const identifiers = new Set<string>();
            const knownMnemonics = new Set<string>([
                ...Object.keys(this.usageRulesZ80).map(k => k.toUpperCase()),
                ...Object.keys(this.usageRulesAssembler).map(k => k.toUpperCase()),
            ]);

            let defvarsBraceDepth = 0;
            let macroDepth = 0;

            const stringRegex = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

            // Get definitions
            lines.forEach((rawLine, lineIndex) => {
                const code = this.getCodePart(rawLine);

                const opens = (code.match(/\{/g) || []).length;
                const closes = (code.match(/\}/g) || []).length;
                defvarsBraceDepth += opens - closes;

                if (/^\s*MACRO\b/i.test(code)) {
                    macroDepth += 1;
                }

                if (/^\s*ENDM\b/i.test(code)) {
                    macroDepth = Math.max(0, macroDepth - 1);
                }

                const labelMatch = code.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);

                if (labelMatch) {
                    const name = labelMatch[1];
                    const start = code.indexOf(name);

                    if (!this.isInsideString(code, start, name.length, stringRegex)) {
                        const list = labels.get(name) || [];

                        list.push(lineIndex);
                        labels.set(name, list);
                        identifiers.add(name);
                    }
                }

                const equMatch = code.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+([eE][qQ][uU])\b/);
                const assignMatch = code.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/);
                const dsMatch = code.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+DS\.[BWLD]/i);
                const plainDefvarsName = defvarsBraceDepth > 0 ? code.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*$/) : null;
                const variableMatch = equMatch || assignMatch || dsMatch || plainDefvarsName;

                if (variableMatch) {
                    const name = variableMatch[1];
                    const start = code.indexOf(name);

                    if (!this.isInsideString(code, start, name.length, stringRegex)) {
                        const list = variables.get(name) || [];

                        list.push(lineIndex);
                        variables.set(name, list);
                        identifiers.add(name);
                    }
                }
            });

            const reportDuplicates = (map: Map<string, number[]>, type: 'label' | 'variable') => {
                map.forEach((locations, name) => {
                    if (locations.length < 2) {
                        return;
                    }

                    locations.slice(1).forEach(lineIdx => {
                        const raw = lines[lineIdx];
                        const codeLine = this.getCodePart(raw);
                        const start = codeLine.indexOf(name);

                        if (start >= 0) {
                            diags.push({
                                range: new vscode.Range(lineIdx, start, lineIdx, start + name.length),
                                severity: vscode.DiagnosticSeverity.Error,
                                message: `Duplicate definition: ${type} '${name}'`,
                                source: 'assembly'
                            });
                        }
                    });
                });
            };

            // Look for errors
            lines.forEach((rawLine, lineIndex) => {
                const code = this.getCodePart(rawLine);

                // Instruction usage validator
                this.validateInstructionUsage(code, lineIndex, diags);

                const refPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
                let matches: RegExpExecArray | null;

                refPattern.lastIndex = 0;

                while ((matches = refPattern.exec(code)) !== null) {
                    const name = matches[1];
                    const index = matches.index;
                    const nameUpper = name.toUpperCase();

                    if (this.isInsideString(code, index, name.length, stringRegex)) {
                        continue;
                    }

                    if (knownMnemonics.has(nameUpper)) {
                        continue;
                    }

                    if (identifiers.has(name)) {
                        continue;
                    }

                    diags.push({
                        range: new vscode.Range(lineIndex, index, lineIndex, index + name.length),
                        severity: vscode.DiagnosticSeverity.Error,
                        message: `Reference to an undefined symbol: '${name}'`,
                        source: 'assembly'
                    });
                }
            });

            reportDuplicates(labels, 'label');
            reportDuplicates(variables, 'variable');

            if (defvarsBraceDepth !== 0) {
                diags.push({
                    range: new vscode.Range(0, 0, 0, 1),
                    severity: vscode.DiagnosticSeverity.Error,
                    message: 'DEFVARS has incorrectly closed parentheses',
                    source: 'assembly'
                });
            }

            if (macroDepth !== 0) {
                diags.push({
                    range: new vscode.Range(0, 0, 0, 1),
                    severity: vscode.DiagnosticSeverity.Error,
                    message: 'MACRO block not closed (need ENDM)',
                    source: 'assembly'
                });
            }

            diagnostics.set(document.uri, diags);
        } catch (error) {
            console.error("[Assembly][Error][Error Detector] " + error);
        }
    }

    private validateInstructionUsage(code: string, lineIndex: number, diags: vscode.Diagnostic[]) {
        try {
            // Don't check labels
            let rest = code;
            const labelMatch = rest.match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*(.*)$/);

            if (labelMatch) {
                rest = labelMatch[1];
            }

            const match = rest.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\b(.*)$/);

            if (!match) {
                return;
            }

            const mnemonic = match[1].toUpperCase();
            const operandsStr = match[2] ?? '';

            const rules = this.usageRulesZ80[mnemonic]?this.usageRulesZ80[mnemonic]:this.usageRulesAssembler[mnemonic];

            if (!rules) {
                return;
            }

            // Parse operands: split by ','
            const operandsOriginal = operandsStr;
            const operands = operandsStr
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            // Try each rule for the keyword
            let anyRuleMatched = false;
            const errors: string[] = [];

            for (const rule of rules) {
                // Get rule
                const spec = this.parseUsageRule(rule);

                // If zero operands expected
                if (spec.placeholders.length === 0) {
                    if (operands.length === 0 && !/\S/.test(operandsStr)) {
                        anyRuleMatched = true;
                        break;
                    }

                    errors.push(`Expected no operands (${rule})`);

                    continue;
                }

                // Operand count
                if (operands.length !== spec.placeholders.length) {
                    errors.push(`Expected ${spec.placeholders.length} operand(s), got ${operands.length} (${rule})`);

                    continue;
                }

                // Validate operands
                let searchFrom = code.indexOf(operandsOriginal);

                if (searchFrom < 0) {
                    searchFrom = code.indexOf(mnemonic) + mnemonic.length;
                }

                let pos = searchFrom;
                let allOperandsValid = true;

                for (let i = 0; i < spec.placeholders.length; i++) {
                    const placehold = spec.placeholders[i];
                    const operand = operands[i];
                    const operandUpper = operand.toUpperCase();
                    const index = code.indexOf(operand, pos);

                    if (index >= 0) {
                        pos = index + operand.length + 1;
                    }

                    let valid = false;

                    if (placehold.kind === 'any') {
                        valid = true;
                    }
                    else if (placehold.kind === 'register-set' && placehold.set) {
                        valid = placehold.set.has(operandUpper);
                    }
                    else if (placehold.kind === 'options' && placehold.options) {
                        valid = placehold.options.has(operandUpper);
                    }
                    else if (placehold.kind === 'literal' && placehold.literal) {
                        valid = operandUpper === placehold.literal.toUpperCase();
                    }

                    if (!valid) {
                        allOperandsValid = false;
                        errors.push(`Invalid operand '${operand}' for pattern: ${rule}`);

                        break;
                    }
                }

                if (allOperandsValid) {
                    anyRuleMatched = true;
                    break;
                }
            }

            // If no variant matched, report error
            if (!anyRuleMatched && rules.length > 0) {
                const start = code.indexOf(operandsOriginal);
                const startstr = start >= 0 ? start : code.indexOf(mnemonic) + mnemonic.length;
                const endstr = code.length;

                const message = rules.length === 1 
                    ? `Invalid usage: ${errors[0] || rules[0]}`
                    : `No valid form found. Tried ${rules.length} variant(s): ${rules.join(' | ')}`;

                diags.push({
                    range: new vscode.Range(lineIndex, Math.max(0, startstr), lineIndex, endstr),
                    severity: vscode.DiagnosticSeverity.Error,
                    message: message,
                    source: 'assembly'
                });
            }
        } catch (error) {
            console.error("[Assembly][Error][Error Detector] " + error);
        }
    }

    private parseUsageRule(rule: string): { placeholders: Array<{ kind: 'register-set' | 'options' | 'literal' | 'any'; set?: Set<string>; options?: Set<string>; literal?: string; }> } {
        const placeholders: Array<{ kind: 'register-set' | 'options' | 'literal' | 'any'; set?: Set<string>; options?: Set<string>; literal?: string; }> = [];

        try {
            const tokens = rule.trim().match(/%\[[^\]]*]|%\w+|\S+/g) || [];
            const operandsTokens = tokens.slice(1); // Ignore the command

            for (const token of operandsTokens) {
                if (token.startsWith('%[') && token.endsWith(']')) {
                    const content = token.slice(2, -1).trim();
                    const opts = content.split(/\s+/).map(s => s.trim().toUpperCase()).filter(Boolean);

                    placeholders.push({ kind: 'options', options: new Set(opts) });
                    continue;
                }

                if (token.startsWith('%')) {
                    const key = token.slice(1);
                    const legendEntry = this.usageLegend[key];

                    if (Array.isArray(legendEntry) && legendEntry.every(v => typeof v === 'string')) {
                        placeholders.push({ kind: 'register-set', set: new Set(legendEntry.map(v => v.toUpperCase())) });
                    }
                    else if (legendEntry !== undefined) {
                        placeholders.push({ kind: 'any' }); // Known placeholder type but not a fixed set
                    }
                    else {
                        placeholders.push({ kind: 'literal', literal: token });
                    }

                    continue;
                }

                placeholders.push({ kind: 'literal', literal: token });
            }
        } catch (error) {
            console.error("[Assembly][Error][Error Detector] " + error);
        }
        
        return { placeholders };
    }
}