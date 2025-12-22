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
        Any: 6
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
        'addr': [this.typesOfUsage.Any8BitNumber, this.typesOfUsage.Any16BitNumber, this.typesOfUsage.AnyLabel, this.typesOfUsage.AnyVariable],
        'ee': [this.typesOfUsage.AnySigned16BitNumber, this.typesOfUsage.AnyLabel],

        'cc': ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'],

        'b': ['0', '1', '2', '3', '4', '5', '6', '7'],
        's': [this.typesOfUsage.Any8BitNumber],
        'v': ['00h', '08h', '10h', '18h', '20h', '28h', '30h', '38h'],

        'd': ['IX', 'IY', 'BC', 'DE', 'HL', 'AF'],
        'str': [this.typesOfUsage.AnyString],
        'var': [this.typesOfUsage.AnyVariable],
        'func': [this.typesOfUsage.AnyLabel],
        'any': [this.typesOfUsage.Any]
    };

    // Assembler usage rules
    private readonly usageRulesAssembler: Record<string, Array<string>> = {
        'ALIGN': ['ALIGN %addr'],
        'BITS': ['BITS 16', 'BITS 32', 'BITS 64'],
        'DB': ['DB %any'],
        'DEFB': ['DEFB %var', 'DEFB %str, %s'],
        'DEFC': ['DEFC %var = %any'],
        'DEFGROUP': ['DEFGROUP 0 { %any }'],
        'DEFINE': ['DEFINE %any'],
        'DEFM': ['DEFM %str', 'DEFM %str, %s', 'DEFM %s'],
        'DEFS': ['DEFS %any'],
        'DEFVARS': ['DEFVARS 0 { %any }'],
        'DEFW': ['DEFW %var', 'DEFW %func', 'DEFW %s'],
        'DM': ['DM %any'],
        'DS': ['DS.B %[%var %s]', 'DS.W %[%var %s]'],
        'DW': ['DW %any'],
        'ELSE': ['ELSE'],
        'END': ['END'],
        'ENDIF': ['ENDIF'],
        'ENDM': ['ENDM'],
        'ENDR': ['ENDR'],
        'EQU': ['%var EQU %any'],
        'EXTERN': ['EXTERN %var'],
        'IF': ['IF %any'],
        'IFNDEF': ['IFNDEF %var', 'IFNDEF %func'],
        'INCBIN': ['INCBIN %str'],
        'INCLUDE': ['INCLUDE %str'],
        'MACRO': ['MACRO %var', 'MACRO %var %any'],
        'ORG': ['ORG %nn', 'ORG %nnnn', 'ORG %var'],
        'PUBLIC': ['PUBLIC %func', 'PUBLIC %var'],
        'REPT': ['REPT %var', 'REPT %s'],
        'REPTI': ['REPTI %any'],
        'SECTION': ['SECTION %var'],
        'SEEK': ['SEEK %any'],
        'TIMES': ['TIMES %any']
    };

    // Z80 commands usage rules
    private readonly usageRulesZ80: Record<string, Array<string>> = {
        'ADC': ['ADC HL, %ss', 'ADC A, %r', 'ADC A, %nn', 'ADC $r', 'ADC %nn'],
        'ADD': ['ADD A, %r', 'ADD A, (HL)', 'ADD A, (IX+%s)', 'ADD A, (IY+%s)', 'ADD HL, %ss', 'ADD IX, %pp', 'ADD IY, %rr', 'ADD %any'],
        'AND': ['AND %r', 'AND %nn'],
        'BIT': ['BIT %b, (HL)', 'BIT %b, (IX+%s)', 'BIT %b, (IY+%s)', 'BIT %b, %r'],
        'CALL': ['CALL %cc, %addr', 'CALL %addr'],
        'CCF': ['CCF'],
        'CP': ['CP %nn', 'CP %r', 'CP (%xx)'],
        'CPD': ['CPD'],
        'CPDR': ['CPDR'],
        'CPI': ['CPI'],
        'CPIR': ['CPIR'],
        'CPL': ['CPL'],
        'DAA': ['DAA'],
        'DEC': ['DEC %r', 'DEC %ss', 'DEC IX', 'DEC IY'],
        'DJNZ': ['DJNZ %ee'],
        'EI': ['EI'],
        'EX': ['EX (SP), HL', 'EX (SP), IX', 'EX (SP), IY', 'EX AF, AF\'', 'EX DE, HL'],
        'EXX': ['EXX'],
        'HALT': ['HALT'],
        'IM': ['IM %[0 1 2]'],
        'IN': ['IN A, (%nn)', 'IN %r, (C)'],
        'INC': ['INC %r', 'INC (HL)', 'INC IX', 'INC IY', 'INC (IX+%s)', 'INC (IY+%s)', 'INC %ss'],
        'IND': ['IND'],
        'INDR': ['INDR'],
        'INI': ['INI'],
        'INIR': ['INIR'],
        'JP': ['JP (HL)', 'JP (IX)', 'JP %cc, %addr', 'JP %addr'],
        'JR': ['JR C, %ee', 'JR %ee', 'JR NC, %ee', 'JR NZ, %ee', 'JR Z, %ee'],
        'LD': ['LD A, (BC)', 'LD A, (DE)', 'LD A, I', 'LD A, (%addr)', 'LD A, R', 'LD (BC), A', 'LD (DE), A', 'LD (HL), %nn', 'LD %dd, %addr', 'LD %dd, (%addr)', 'LD HL, (%addr)', 'LD (HL), %r', 'LD I, A', 'LD IX, %addr', 'LD IX, (%addr)', 'LD (IX+%s), %nn', 'LD (IX+%s), %r', 'LD IY, %addr', 'LD IY, (%addr)', 'LD (IY+%s), %nn', 'LD (IY+%s), %r', 'LD (%addr), A', 'LD (%addr), %dd', 'LD (%addr), HL', 'LD (%addr), IX', 'LD (%addr), IY', 'LD R, A', 'LD %r, (HL)', 'LD %r, (IX+%s)', 'LD %r, (IY+%s)', 'LD %r, %nn', 'LD %r, %r\'', 'LD SP, HL', 'LD SP, IX', 'LD SP, IY'],
        'LDD': ['LDD'],
        'LDDR': ['LDDR'],
        'LDI': ['LDI'],
        'LDIR': ['LDIR'],
        'NEG': ['NEG'],
        'NOP': ['NOP'],
        'OR': ['OR %r', 'OR %nn'],
        'OTIR': ['OTIR'],
        'OUT': ['OUT (C), %r', 'OUT (%nn), A'],
        'OUTD': ['OUTD'],
        'OUTI': ['OUTI'],
        'POP': ['POP IX', 'POP IY', 'POP %qq'],
        'PUSH': ['PUSH IX', 'PUSH IY', 'PUSH %qq'],
        'RES': ['RES %b, %r'],
        'RET': ['RET', 'RET %cc'],
        'RETI': ['RETI'],
        'RETN': ['RETN'],
        'RL': ['RL %r'],
        'RLA': ['RLA'],
        'RLC': ['RLC (HL)', 'RLC (IX+%s)', 'RLC (IY+%s)', 'RLC %r'],
        'RLCA': ['RLCA'],
        'RLD': ['RLD'],
        'RR': ['RR %r'],
        'RRA': ['RRA'],
        'RRC': ['RRC %r'],
        'RRCA': ['RRCA'],
        'RRD': ['RRD'],
        'RST': ['RST %v'],
        'SBC': ['SBC A, %r', 'SBC A, %nn', 'SBC HL, %ss'],
        'SCF': ['SCF'],
        'SET': ['SET %b, (HL)', 'SET %b, (IX+%s)', 'SET %b, (IY+%s)','SET %b, %r'],
        'SLA': ['SLA %r'],
        'SRA': ['SRA %r'],
        'SRL': ['SRL %r'],
        'SUB': ['SUB %r', 'SUB %nn', 'SUB (%xx)'],
        'XOR': ['XOR %r', 'XOR %nn', 'XOR %r, %r', 'XOR %r, %addr', 'XOR %d, %addr']
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
            console.error("[Z80 Assembly][Error][Error Detector] " + error);
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
            console.error("[Z80 Assembly][Error][Error Detector] " + error);
        }

        return false;
    }

    public async validate(document: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection): Promise<void> {
        try {
            console.log("[Z80 Assembly][Debug] Z80 Assembly Error Detector Started");

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
            
            // Create set of known registers and keywords
            const knownRegisters = new Set<string>();
            Object.values(this.usageLegend).forEach(entries => {
                if (Array.isArray(entries)) {
                    entries.forEach(entry => {
                        if (typeof entry === 'string') {
                            knownRegisters.add(entry.toUpperCase());
                        }
                    });
                }
            });

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

                const labelMatch = code.match(/^\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\s*:/);

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

                const equMatch = code.match(/^\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\s+([eE][qQ][uU])\b/);
                const assignMatch = code.match(/^\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\s*=\s*/);
                const dsMatch = code.match(/^\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\s+DS\.[BWLD]/i);
                const plainDefvarsName = defvarsBraceDepth > 0 ? code.match(/^\s*([a-zA-Z_.][a-zA-Z0-9_.]*)\s*$/) : null;
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

                // Handle assembler declarations
                const extern = code.match(/^\s*EXTERN\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\b/i);
                const section = code.match(/^\s*SECTION\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\b/i);
                const defb = code.match(/^\s*DEFB\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\b/i);
                const defw = code.match(/^\s*DEFW\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\b/i);
                const defc = code.match(/^\s*DEFC\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\b/i);
                const macro = code.match(/^\s*MACRO\s+([a-zA-Z_.][a-zA-Z0-9_.]*)\b/i);
                const declarationMatch = extern || section || defb || defw || defc || macro;

                if (declarationMatch) {
                    const name = declarationMatch[1];
                    const start = code.indexOf(name);

                    if (!this.isInsideString(code, start, name.length, stringRegex)) {
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
                                source: 'Z80 Assembly'
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

                const refPattern = /(?<![a-zA-Z0-9_.])([a-zA-Z_.][a-zA-Z0-9_.]*)(?![a-zA-Z0-9_.])/g;
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

                    if (knownRegisters.has(nameUpper)) {
                        continue;
                    }

                    if (identifiers.has(name)) {
                        continue;
                    }

                    diags.push({
                        range: new vscode.Range(lineIndex, index, lineIndex, index + name.length),
                        severity: vscode.DiagnosticSeverity.Error,
                        message: `Reference to an undefined symbol: '${name}'`,
                        source: 'Z80 Assembly'
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
                    source: 'Z80 Assembly'
                });
            }

            if (macroDepth !== 0) {
                diags.push({
                    range: new vscode.Range(0, 0, 0, 1),
                    severity: vscode.DiagnosticSeverity.Error,
                    message: 'MACRO block not closed (need ENDM)',
                    source: 'Z80 Assembly'
                });
            }

            diagnostics.set(document.uri, diags);
        } catch (error) {
            console.error("[Z80 Assembly][Error][Error Detector] " + error);
        }
    }

    private validateInstructionUsage(code: string, lineIndex: number, diags: vscode.Diagnostic[]) {
        try {
            // Don't check labels
            let rest = code;
            const labelMatch = rest.match(/^\s*[A-Za-z_.][A-Za-z0-9_.]*\s*:\s*(.*)$/);

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

            // If any don't count the number of operands
            const hasAnyPlaceholder = rules.some(r => r.includes('%any'));
            
            // Split operands with ','
            const operandsOriginal = operandsStr;
            const operands = hasAnyPlaceholder && operandsStr.trim().length > 0
                ? [operandsStr.trim()]
                : operandsStr
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
                    else if (placehold.kind === 'pattern' && placehold.regex) {
                        const matchPattern = placehold.regex.exec(operand);

                        if (matchPattern) {
                            const captured = matchPattern[1] ?? '';
                            const capturedUpper = captured.toUpperCase();

                            if (placehold.set) {
                                valid = placehold.set.has(capturedUpper);
                            }
                            else if (placehold.options) {
                                valid = placehold.options.has(capturedUpper);
                            }
                            else if (placehold.literal) {
                                valid = capturedUpper === placehold.literal.toUpperCase();
                            }
                            else {
                                valid = true; // Generic placeholder
                            }
                        }
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

                const message = `Invalid usage. Allowed variant(s): ${rules.join(' | ')}`;

                diags.push({
                    range: new vscode.Range(lineIndex, Math.max(0, startstr), lineIndex, endstr),
                    severity: vscode.DiagnosticSeverity.Error,
                    message: message,
                    source: 'Z80 Assembly'
                });
            }
        } catch (error) {
            console.error("[Z80 Assembly][Error][Error Detector] " + error);
        }
    }

    private parseUsageRule(rule: string): { placeholders: Array<{ kind: 'register-set' | 'options' | 'literal' | 'any' | 'pattern'; set?: Set<string>; options?: Set<string>; literal?: string; regex?: RegExp; }> } {
        const placeholders: Array<{ kind: 'register-set' | 'options' | 'literal' | 'any' | 'pattern'; set?: Set<string>; options?: Set<string>; literal?: string; regex?: RegExp; }> = [];

        try {
            const tokens = rule.trim().match(/%\[[^\]]*]|%\w+|\S+/g) || [];
            const operandsTokens = tokens.slice(1).filter(t => !/^[,()]+$/.test(t)); // Ignore

            for (const token of operandsTokens) {
                const cleanToken = token.replace(/,+$/, ''); // Clear the token from operands

                if (cleanToken.startsWith('%[') && cleanToken.endsWith(']')) {
                    const content = cleanToken.slice(2, -1).trim();
                    const opts = content.split(/\s+/).map(s => s.trim().toUpperCase()).filter(Boolean);

                    placeholders.push({ kind: 'options', options: new Set(opts) });
                    continue;
                }

                // Support operands in ()
                if (cleanToken.includes('%') && !cleanToken.startsWith('%')) {
                    const keyMatch = cleanToken.match(/%([A-Za-z0-9_]+)/);

                    if (keyMatch) {
                        const key = keyMatch[1];
                        const legendEntry = this.usageLegend[key];

                        let set: Set<string> | undefined;
                        let options: Set<string> | undefined;
                        let literal: string | undefined;

                        if (Array.isArray(legendEntry) && legendEntry.every(v => typeof v === 'string')) {
                            set = new Set(legendEntry.map(v => v.toUpperCase()));
                        }
                        else if (legendEntry === undefined) {
                            literal = key;
                        }

                        const escapedToken = this.escapeRegex(cleanToken);
                        const escapedPlaceholder = this.escapeRegex('%' + key);
                        const regex = new RegExp('^' + escapedToken.replace(escapedPlaceholder, '(.+)') + '$', 'i');

                        placeholders.push({ kind: 'pattern', regex, set, options, literal });
                        continue;
                    }
                }

                if (cleanToken.startsWith('%')) {
                    const key = cleanToken.slice(1);
                    const legendEntry = this.usageLegend[key];

                    if (Array.isArray(legendEntry) && legendEntry.every(v => typeof v === 'string')) {
                        placeholders.push({ kind: 'register-set', set: new Set(legendEntry.map(v => v.toUpperCase())) });
                    }
                    else if (legendEntry !== undefined) {
                        placeholders.push({ kind: 'any' }); // Known placeholder type but not a fixed set
                    }
                    else {
                        placeholders.push({ kind: 'literal', literal: cleanToken.startsWith('%') ? cleanToken.slice(1) : cleanToken });
                    }

                    continue;
                }

                placeholders.push({ kind: 'literal', literal: cleanToken });
            }
        } catch (error) {
            console.error("[Z80 Assembly][Error][Error Detector] " + error);
        }
        
        return { placeholders };
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}