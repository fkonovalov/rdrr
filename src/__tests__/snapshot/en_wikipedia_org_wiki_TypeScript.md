---
title: "TypeScript - Wikipedia"
author: "Contributors to Wikimedia projects"
site: "Wikimedia Foundation, Inc."
published: "2006-11-28T04:40:38Z"
source: "https://en.wikipedia.org/wiki/TypeScript"
domain: "en.wikipedia.org"
language: "en"
dir: "ltr"
word_count: 3175
---

**TypeScript** (**TS**) is a [high-level](https://en.wikipedia.org/wiki/High-level_programming_language "High-level programming language") [programming language](https://en.wikipedia.org/wiki/Programming_language "Programming language") that adds [static typing](https://en.wikipedia.org/wiki/Static_typing "Static typing") with optional type [annotations](https://en.wikipedia.org/wiki/Annotation#Software_and_engineering "Annotation") to [JavaScript](https://en.wikipedia.org/wiki/JavaScript "JavaScript"). It is designed for developing large applications. It [transpiles](https://en.wikipedia.org/wiki/Source-to-source_compiler "Source-to-source compiler") to JavaScript.[^6] It is developed by [Microsoft](https://en.wikipedia.org/wiki/Microsoft "Microsoft") as [free and open-source software](https://en.wikipedia.org/wiki/Free_and_open-source_software "Free and open-source software") released under an [Apache License 2.0](https://en.wikipedia.org/wiki/Apache_License_2.0 "Apache License 2.0").

TypeScript may be used to develop JavaScript applications for both [client-side](https://en.wikipedia.org/wiki/Client-side "Client-side") and [server-side](https://en.wikipedia.org/wiki/Server-side "Server-side") execution (as with [React.js](https://en.wikipedia.org/wiki/React.js "React.js"), [Node.js](https://en.wikipedia.org/wiki/Node.js "Node.js"), [Deno](https://en.wikipedia.org/wiki/Deno_\(software\) "Deno (software)") or [Bun](https://en.wikipedia.org/wiki/Bun_\(software\) "Bun (software)")). Multiple options are available for transpiling. The default TypeScript Compiler can be used,[^7] or the [Babel](https://en.wikipedia.org/wiki/Babel_\(transcompiler\) "Babel (transcompiler)") compiler can be invoked to convert TypeScript to JavaScript.

TypeScript supports definition files that can contain type information of existing JavaScript [libraries](https://en.wikipedia.org/wiki/Library_\(computing\) "Library (computing)"), much like [C++](https://en.wikipedia.org/wiki/C%2B%2B "C++") [header files](https://en.wikipedia.org/wiki/Include_directive "Include directive") can describe the structure of existing [object files](https://en.wikipedia.org/wiki/Object_file "Object file"). This enables other programs to use the values defined in the files as if they were statically typed TypeScript entities. There are third-party header files for popular libraries such as [jQuery](https://en.wikipedia.org/wiki/JQuery "JQuery"), [MongoDB](https://en.wikipedia.org/wiki/MongoDB "MongoDB"), and [D3.js](https://en.wikipedia.org/wiki/D3.js "D3.js"). TypeScript headers for the [Node.js](https://en.wikipedia.org/wiki/Node.js "Node.js") library modules are also available, allowing development of Node.js programs within TypeScript.[^8]

The TypeScript compiler is [written in TypeScript](https://en.wikipedia.org/wiki/Self-hosting_\(compilers\) "Self-hosting (compilers)") and [compiled](https://en.wikipedia.org/wiki/Source-to-source_compiler "Source-to-source compiler") to JavaScript. It is licensed under the [Apache License 2.0](https://en.wikipedia.org/wiki/Apache_License_2.0 "Apache License 2.0"). [Anders Hejlsberg](https://en.wikipedia.org/wiki/Anders_Hejlsberg "Anders Hejlsberg"), lead architect of [C#](https://en.wikipedia.org/wiki/C_Sharp_\(programming_language\) "C Sharp (programming language)") and creator of [Delphi](https://en.wikipedia.org/wiki/Delphi_\(software\) "Delphi (software)") and [Turbo Pascal](https://en.wikipedia.org/wiki/Turbo_Pascal "Turbo Pascal"), has worked on developing TypeScript.[^9] [^10] [^11] [^12]

## History

TypeScript was released to the public in October 2012, with version 0.8, after two years of internal development at Microsoft.[^13] [^14] Soon after the initial public release, [Miguel de Icaza](https://en.wikipedia.org/wiki/Miguel_de_Icaza "Miguel de Icaza") praised the language, but criticized the lack of mature [integrated development environment](https://en.wikipedia.org/wiki/Integrated_development_environment "Integrated development environment") (IDE) support apart from [Microsoft Visual Studio](https://en.wikipedia.org/wiki/Microsoft_Visual_Studio "Microsoft Visual Studio"), which was unavailable then on [Linux](https://en.wikipedia.org/wiki/Linux "Linux") and [macOS](https://en.wikipedia.org/wiki/MacOS "MacOS").[^15] [^16] As of April 2021 there is support in other IDEs and text editors, including [Emacs](https://en.wikipedia.org/wiki/Emacs "Emacs"), [Vim](https://en.wikipedia.org/wiki/Vim_\(text_editor\) "Vim (text editor)"), [WebStorm](https://en.wikipedia.org/wiki/JetBrains#WebStorm "JetBrains"), [Atom](https://en.wikipedia.org/wiki/Atom_\(text_editor\) "Atom (text editor)") [^17] and Microsoft's own [Visual Studio Code](https://en.wikipedia.org/wiki/Visual_Studio_Code "Visual Studio Code").[^18] TypeScript 0.9, released in 2013, added support for [generics](https://en.wikipedia.org/wiki/Generic_programming "Generic programming").[^19]

TypeScript 1.0 was released at Microsoft's [Build](https://en.wikipedia.org/wiki/Build_\(developer_conference\) "Build (developer conference)") developer conference in 2014.[^20] [Visual Studio 2013](https://en.wikipedia.org/wiki/Visual_Studio_2013 "Visual Studio 2013") Update 2 provided built-in support for TypeScript.[^21] Further improvement were made in July 2014, when the development team announced a new TypeScript compiler, asserted to have a five-fold performance increase. Simultaneously, the source code, which was initially hosted on [CodePlex](https://en.wikipedia.org/wiki/CodePlex "CodePlex"), was moved to [GitHub](https://en.wikipedia.org/wiki/GitHub "GitHub").[^22]

On 22 September 2016, TypeScript 2.0 was released, introducing several features, including the ability for programmers to optionally enforce [null safety](https://en.wikipedia.org/wiki/Null_safety "Null safety"),[^23] to mitigate what's sometimes referred to as the [billion-dollar mistake](https://en.wikipedia.org/wiki/Null_pointer#History "Null pointer").

TypeScript 3.0 was released on 30 July 2018,[^24] bringing many language additions like tuples in rest parameters and spread expressions, rest parameters with tuple types, generic rest parameters and so on.[^25]

TypeScript 4.0 was released on 20 August 2020.[^26] While 4.0 did not introduce any breaking changes, it added language features such as Custom [JSX](https://en.wikipedia.org/wiki/JSX_\(JavaScript\) "JSX (JavaScript)") Factories and Variadic Tuple Types.[^26]

TypeScript 5.0 was released on 16 March 2023 and included support for decorators.[^27]

On March 11, 2025, Anders Hejlsberg announced on the TypeScript blog that the team is working on a [Go](https://en.wikipedia.org/wiki/Go_\(programming_language\) "Go (programming language)") port of the TypeScript compiler to be released as TypeScript version 7.0 later this year. It is expected to feature a 10x [speedup](https://en.wikipedia.org/wiki/Speedup "Speedup").[^28]

On December 2nd, 2025, Daniel Rosenwasser announced on the blog that TypeScript 6.0 will be the last release written in TypeScript itself, and TypeScript 7.0 will be the first Go-based release.[^29]

## Design

TypeScript originated from the shortcomings of JavaScript for developing large-scale applications both at Microsoft and among their external customers.[^30] Challenges with dealing with complex JavaScript code led to demand for custom tooling to ease developing of components in the language.[^31]

Developers sought a solution that would not break compatibility with the [ECMAScript](https://en.wikipedia.org/wiki/ECMAScript "ECMAScript") (ES) standard and its ecosystem, so a [compiler](https://en.wikipedia.org/wiki/Compiler "Compiler") was developed to transform a superset of JavaScript with type annotations and classes (TypeScript files) back into vanilla ECMAScript 5 code. TypeScript classes were based on the then-proposed ECMAScript 6 class specification to make writing [prototypal inheritance](https://en.wikipedia.org/wiki/Prototype-based_programming "Prototype-based programming") less verbose and error-prone, and type annotations enabled [IntelliSense](https://en.wikipedia.org/wiki/Code_completion "Code completion") and improved tooling.

## Features

TypeScript adds the following syntax extensions to JavaScript:

- [Type signatures](https://en.wikipedia.org/wiki/Type_signature "Type signature") (annotations) and [compile-time](https://en.wikipedia.org/wiki/Compile-time "Compile-time") [type checking](https://en.wikipedia.org/wiki/Type_checking "Type checking")
- [Type inference](https://en.wikipedia.org/wiki/Type_inference "Type inference")
- [Interfaces](https://en.wikipedia.org/wiki/Interface_\(object-oriented_programming\) "Interface (object-oriented programming)")
- [Enumerated types](https://en.wikipedia.org/wiki/Enumerated_type "Enumerated type")
- [Generics](https://en.wikipedia.org/wiki/Generic_programming "Generic programming")
- [Namespaces](https://en.wikipedia.org/wiki/Namespace "Namespace")
- [Tuples](https://en.wikipedia.org/wiki/Tuple "Tuple")
- [Explicit resource management](https://en.wikipedia.org/wiki/Resource_management_\(computing\) "Resource management (computing)") [^32]

Syntactically, TypeScript is very similar to [JScript.NET](https://en.wikipedia.org/wiki/JScript_.NET "JScript .NET"), another Microsoft implementation of the ECMA-262 language standard that added support for static typing and classical object-oriented language features such as classes, inheritance, interfaces, and namespaces. Other inspirations include [Java](https://en.wikipedia.org/wiki/Java_\(programming_language\) "Java (programming language)") and [C#](https://en.wikipedia.org/wiki/C_Sharp_\(programming_language\) "C Sharp (programming language)").

## Compatibility with JavaScript

As TypeScript is simply a superset of JavaScript, existing JavaScript can be adapted to TypeScript and TypeScript program can seamlessly consume JavaScript. The compiler can target all ECMAScript versions 5 and above, transpiling modern features like classes and arrow functions to their older counterparts.

With TypeScript, it is possible to use existing JavaScript code, incorporate popular JavaScript libraries, and call TypeScript-generated code from other JavaScript.[^33] Type declarations for these libraries are usually provided with the source code but can be declared or installed separately if needed.

## Development tools

### Compiler

The TypeScript compiler, named `tsc`, is [written in TypeScript](https://en.wikipedia.org/wiki/Self-hosting_\(compilers\) "Self-hosting (compilers)"). As a result, it can be compiled into regular JavaScript and can then be executed in any JavaScript engine (e.g. a browser). The compiler package comes bundled with a script host that can execute the compiler. It is also available as a [Node.js](https://en.wikipedia.org/wiki/Node.js "Node.js") package that uses Node.js as a host. The compiler is currently being rewritten in [Go](https://en.wikipedia.org/wiki/Go_\(programming_language\) "Go (programming language)") for version 7.[^34]

The compiler can *target* a given edition of ECMAScript (such as [ECMAScript 5](https://en.wikipedia.org/wiki/ECMAScript_version_history "ECMAScript version history") for legacy browser compatibility), but by default compiles for the latest standards.

### IDE and editor support

- [Microsoft](https://en.wikipedia.org/wiki/Microsoft "Microsoft") provides a [plug-in](https://en.wikipedia.org/wiki/Plug-in_\(computing\) "Plug-in (computing)") for [Visual Studio](https://en.wikipedia.org/wiki/Visual_Studio "Visual Studio") 2012 and [WebMatrix](https://en.wikipedia.org/wiki/Microsoft_WebMatrix "Microsoft WebMatrix"), full integrated support in [Visual Studio](https://en.wikipedia.org/wiki/Visual_Studio "Visual Studio") 2013, [Visual Studio](https://en.wikipedia.org/wiki/Visual_Studio "Visual Studio") 2015, and basic text editor support for [Emacs](https://en.wikipedia.org/wiki/Emacs "Emacs") and [Vim](https://en.wikipedia.org/wiki/Vim_\(text_editor\) "Vim (text editor)").[^35]
- [Visual Studio Code](https://en.wikipedia.org/wiki/Visual_Studio_Code "Visual Studio Code") supports TypeScript in addition to several other languages, and offers features like debugging and intelligent [code completion](https://en.wikipedia.org/wiki/Code_completion "Code completion").
- alm.tools is an open source cloud IDE for TypeScript built using TypeScript, ReactJS and TypeStyle.
- [JetBrains](https://en.wikipedia.org/wiki/JetBrains "JetBrains") supports TypeScript with code completion, refactoring and debugging in its IDEs built on IntelliJ platform, such as [PhpStorm](https://en.wikipedia.org/wiki/PhpStorm "PhpStorm") 6, [WebStorm](https://en.wikipedia.org/wiki/WebStorm "WebStorm") 6, and [IntelliJ IDEA](https://en.wikipedia.org/wiki/IntelliJ_IDEA "IntelliJ IDEA"),[^36] as well as their Visual Studio Add-in and extension, ReSharper 8.1.[^37] [^38]
- [Atom](https://en.wikipedia.org/wiki/Atom_\(text_editor\) "Atom (text editor)") has a TypeScript plugin with support for code completion, navigation, formatting, and fast compilation.[^39]
- The online [Cloud9 IDE](https://en.wikipedia.org/wiki/Cloud9_IDE "Cloud9 IDE") and [Codenvy](https://en.wikipedia.org/wiki/Codenvy "Codenvy") support TypeScript.
- A plugin is available for the [NetBeans](https://en.wikipedia.org/wiki/NetBeans "NetBeans") IDE.
- A plugin is available for the [Eclipse IDE](https://en.wikipedia.org/wiki/Eclipse_\(software\) "Eclipse (software)") (version Kepler)
- TypEcs is available for the [Eclipse IDE](https://en.wikipedia.org/wiki/Eclipse_\(software\) "Eclipse (software)").
- The Cross Platform Cloud IDE [Codeanywhere](https://en.wikipedia.org/wiki/Codeanywhere "Codeanywhere") supports TypeScript.
- Webclipse An Eclipse plugin designed to develop TypeScript and [Angular 2](https://en.wikipedia.org/wiki/Angular_\(application_platform\) "Angular (application platform)").
- Angular IDE A standalone IDE available via npm to develop TypeScript and Angular 2 applications, with integrated terminal support.
- Tide – TypeScript Interactive Development Environment for [Emacs](https://en.wikipedia.org/wiki/Emacs "Emacs").

### Integration with build automation tools

Using [plug-ins](https://en.wikipedia.org/wiki/Plug-in_\(computing\) "Plug-in (computing)"), TypeScript can be integrated with [build automation](https://en.wikipedia.org/wiki/Build_automation "Build automation") tools, including Grunt (grunt-ts [^40]), [Apache Maven](https://en.wikipedia.org/wiki/Apache_Maven "Apache Maven") (TypeScript Maven Plugin [^41]), Gulp (gulp-typescript [^42]) and [Gradle](https://en.wikipedia.org/wiki/Gradle "Gradle") (TypeScript Gradle Plugin [^43]).

### Linting tools

TSLint [^44] scans TypeScript code for conformance to a set of standards and guidelines. [ESLint](https://en.wikipedia.org/wiki/ESLint "ESLint"), a standard JavaScript linter, also provided some support for TypeScript via community plugins. However, ESLint's inability to leverage TypeScript's language services precluded certain forms of semantic linting and program-wide analysis.[^45] In early 2019, the TSLint team announced the linter's deprecation in favor of `typescript-eslint`, a joint effort of the TSLint, ESLint and TypeScript teams to consolidate linting under the ESLint umbrella for improved performance, community unity and developer accessibility.[^46]

## Release history

**Legend:**

Unsupported

Supported

**Latest version**

Preview version

Future version

| Version number | Release date | Significant changes |
| --- | --- | --- |
| 0.8 | 1 October 2012 |  |
| 0.9 | 18 June 2013 |  |
| 1.0 | 12 April 2014 |  |
| 1.1 | 6 October 2014 | performance improvements |
| 1.3 | 12 November 2014 | `protected` modifier, tuple types |
| 1.4 | 20 January 2015 | [union types](https://en.wikipedia.org/wiki/Union_type "Union type"), `let` and `const` declarations, template strings, type guards, type aliases |
| 1.5 | 20 July 2015 | ES6 modules, `namespace` keyword, `for..of` support, decorators |
| 1.6 | 16 September 2015 | JSX support, [intersection types](https://en.wikipedia.org/wiki/Intersection_type "Intersection type"), local type declarations, [abstract classes](https://en.wikipedia.org/wiki/Abstract_class "Abstract class") and methods, user-defined type guard functions |
| 1.7 | 30 November 2015 | `async` and `await` support, |
| 1.8 | 22 February 2016 | constraints generics, control flow analysis errors, string literal types, `allowJs` |
| 2.0 | 22 September 2016 | null- and undefined-aware types, control flow based type analysis, discriminated union types, `never` type, `readonly` keyword, type of `this` for functions |
| 2.1 | 8 November 2016 | `keyof` and lookup types, mapped types, object spread and rest, |
| 2.2 | 22 February 2017 | mix-in classes, `object` type, |
| 2.3 | 27 April 2017 | `async` iteration, generic parameter defaults, strict option |
| 2.4 | 27 June 2017 | dynamic import expressions, string enums, improved inference for generics, strict contravariance for callback parameters |
| 2.5 | 31 August 2017 | optional catch clause variables |
| 2.6 | 31 October 2017 | strict function types |
| 2.7 | 31 January 2018 | constant-named properties, fixed-length tuples |
| 2.8 | 27 March 2018 | conditional types, improved `keyof` with intersection types |
| 2.9 | 14 May 2018 | support for symbols and numeric literals in `keyof` and mapped object types |
| 3.0 | 30 July 2018 | project references, extracting and spreading parameter lists with tuples |
| 3.1 | 27 September 2018 | mappable tuple and array types |
| 3.2 | 30 November 2018 | stricter checking for `bind`, `call`, and `apply` |
| 3.3 | 31 January 2019 | relaxed rules on methods of union types, incremental builds for composite projects |
| 3.4 | 29 March 2019 | faster incremental builds, type inference from generic functions, `readonly` modifier for arrays, `const` assertions, type-checking global `this` |
| 3.5 | 29 May 2019 | faster incremental builds, omit helper type, improved excess property checks in union types, smarter union type checking |
| 3.6 | 28 August 2019 | Stricter generators, more accurate array spread, better Unicode support for identifiers |
| 3.7 | 5 November 2019 | Optional chaining, nullish coalescing |
| 3.8 | 20 February 2020 | Type-only imports and exports, ECMAScript private fields, top-level `await` |
| 3.9 | 12 May 2020 | Improvements in inference, speed improvements |
| 4.0 | 20 August 2020 | Variadic tuple types, labeled tuple elements |
| 4.1 | 19 November 2020 | Template literal types, key remapping in mapped types, recursive conditional types |
| 4.2 | 25 February 2021 | Smarter type alias preservation, leading/middle rest elements in tuple types, stricter checks for the `in` operator, `abstract` construct signatures |
| 4.3 | 26 May 2021 | Separate write types on properties, `override` and the `--noImplicitOverride` flag, template string type improvements |
| 4.4 | 26 August 2021 | Control flow analysis of aliased conditions and discriminants, symbol and template string pattern index signatures |
| 4.5 | 17 November 2021 | Type and promise improvements, supporting lib from `node_modules`, template string types as discriminants, and `es2022` module |
| 4.6 | 28 February 2022 | Type inference and checks improvements, support for ES2022 target, better ECMAScript handling |
| 4.7 | 24 May 2022 | Support for ES modules, instantiation expressions, variance annotations for type parameters, better control-flow checks and type check improvements |
| 4.8 | 25 August 2022 | Intersection and union types improvements, better type inference |
| 4.9 | 15 November 2022 | `satisfies` operator, auto-accessors in classes (proposal), improvements in type narrowing and checks |
| 5.0 | 16 March 2023 | ES decorators (proposal), type inference improvements, `bundler` module resolution mode, speed and size optimizations |
| 5.1 | 1 June 2023 | Easier implicit returns for `undefined` and unrelated types for getters and setters |
| 5.2 | 24 August 2023 | `using` declarations and explicit resource management, decorator metadata and named and anonymous tuple elements |
| 5.3 | 20 November 2023 | Improved type narrowing, correctness checks and performance optimizations |
| 5.4 | 6 March 2024 | `Object.groupBy` and `Map.groupBy` support |
| 5.5 | 20 June 2024 | Inferred Type Predicates, Regular Expression Syntax Checking, and Type Imports in JSDoc |
| 5.6 | 9 September 2024 | Advanced type inference, variadic tuple enhancements, partial module declarations. |
| 5.7 | 22 November 2024 |  |
| 5.8 | 28 February 2025 |  |
| 5.9 | 31 July 2025 |  |
| 6.0 | 23 March 2026 | Introduce some deprecations and breaking changes to align with the upcoming native codebase. Strict mode is now enabled by default. Last version with compiler and language service based on JavaScript before rewrite to Go language. |
| 7.0 |  | Rewrite in Go with faster performance. |

[^1]: ["TypeScript"](https://web.archive.org/web/20150403224440/https://typescript.codeplex.com/releases/view/95554). *[CodePlex](https://en.wikipedia.org/wiki/CodePlex "CodePlex")*. Archived from [the original](https://typescript.codeplex.com/releases/view/95554) on 3 April 2015. Retrieved 26 April 2015.

[^2]: [https://github.com/microsoft/TypeScript/releases](https://github.com/microsoft/TypeScript/releases)

[^3]: ["Type Compatibility"](https://www.typescriptlang.org/docs/handbook/type-compatibility.html). *TypeScript*. [Archived](https://web.archive.org/web/20180312103740/http://www.typescriptlang.org/docs/handbook/type-compatibility.html) from the original on 12 March 2018. Retrieved 21 March 2018.

[^4]: ["The Early History of F#"](https://fsharp.org/history/hopl-final/hopl-fsharp.pdf) (PDF). [Archived](https://web.archive.org/web/20240809075047/https://fsharp.org/history/hopl-final/hopl-fsharp.pdf) (PDF) from the original on 9 August 2024. Retrieved 5 February 2024. TypeScript was directly influenced by F#: one of the originators of TypeScript was Luke Hoban, who began TypeScript (then called Strada) immediately after working on F# 2.0. Recently he noted the influence of F# on early parts of the TypeScript design \[Hoban 2017\].

[^5]: Nelson, Gary (28 April 2020). ["How ActionScript foreshadowed TypeScript"](https://javascript.plainenglish.io/how-actionscript-foreshadowed-typescript-149cdb764de9). *Medium*. [Archived](https://web.archive.org/web/20240809080212/https://javascript.plainenglish.io/how-actionscript-foreshadowed-typescript-149cdb764de9?gi=8d034fbd408d) from the original on 9 August 2024. Retrieved 9 July 2022.

[^6]: Bright, Peter (3 October 2012). ["Microsoft TypeScript: the JavaScript we need, or a solution looking for a problem?"](https://arstechnica.com/information-technology/2012/10/microsoft-typescript-the-javascript-we-need-or-a-solution-looking-for-a-problem/). *[Ars Technica](https://en.wikipedia.org/wiki/Ars_Technica "Ars Technica")*. [Condé Nast](https://en.wikipedia.org/wiki/Cond%C3%A9_Nast "Condé Nast"). [Archived](https://web.archive.org/web/20181009164414/https://arstechnica.com/information-technology/2012/10/microsoft-typescript-the-javascript-we-need-or-a-solution-looking-for-a-problem/) from the original on 9 October 2018. Retrieved 26 April 2015.

[^7]: ["TypeScript Programming with Visual Studio Code"](https://code.visualstudio.com/docs/languages/typescript). *code.visualstudio.com*. [Archived](https://web.archive.org/web/20220922080247/https://code.visualstudio.com/docs/languages/typescript) from the original on 22 September 2022. Retrieved 12 February 2019.

[^8]: ["borisyankov/DefinitelyTyped"](https://github.com/borisyankov/DefinitelyTyped). *[GitHub](https://en.wikipedia.org/wiki/GitHub "GitHub")*. [Archived](https://web.archive.org/web/20151101104210/https://github.com/borisyankov/DefinitelyTyped) from the original on 1 November 2015. Retrieved 26 April 2015.

[^9]: Foley, Mary Jo (1 October 2012). ["Microsoft takes the wraps off TypeScript, a superset of JavaScript"](https://www.zdnet.com/article/microsoft-takes-the-wraps-off-typescript-a-superset-of-javascript/). *[ZDNet](https://en.wikipedia.org/wiki/ZDNet "ZDNet")*. [CBS Interactive](https://en.wikipedia.org/wiki/CBS_Interactive "CBS Interactive"). [Archived](https://web.archive.org/web/20141113161248/http://www.zdnet.com/microsoft-takes-the-wraps-off-typescript-a-superset-of-javascript-7000004993/) from the original on 13 November 2014. Retrieved 26 April 2015.

[^10]: Somasegar, S. (1 October 2012). ["TypeScript: JavaScript Development at Application Scale"](https://web.archive.org/web/20170926142536/https://blogs.msdn.microsoft.com/somasegar/2012/10/01/typescript-javascript-development-at-application-scale/). *Somasegar's blog*. Microsoft. Archived from [the original](http://blogs.msdn.com/b/somasegar/archive/2012/10/01/typescript-javascript-development-at-application-scale) on 26 September 2017. Retrieved 26 April 2015.

[^11]: Baxter-Reynolds, Matt (1 October 2012). ["Microsoft TypeScript: Can the father of C# save us from the tyranny of JavaScript?"](https://www.zdnet.com/article/microsoft-typescript-can-the-father-of-c-save-us-from-the-tyranny-of-javascript/). *[ZDNet](https://en.wikipedia.org/wiki/ZDNet "ZDNet")*. [Archived](https://web.archive.org/web/20140803030303/http://www.zdnet.com/microsoft-typescript-can-the-father-of-c-save-us-from-the-tyranny-of-javascript-7000005054/) from the original on 3 August 2014. Retrieved 26 April 2015.

[^12]: Jackson, Joab (1 October 2012). ["Microsoft Augments Javascript for Large-scale Development"](https://web.archive.org/web/20131217223751/http://www.cio.com/article/717679/Microsoft_Augments_Javascript_for_Large_scale_Development). *CIO*. [IDG Enterprise](https://en.wikipedia.org/wiki/IDG_Enterprise "IDG Enterprise"). Archived from [the original](http://www.cio.com/article/717679/Microsoft_Augments_Javascript_for_Large_scale_Development) on 17 December 2013. Retrieved 26 April 2015.

[^13]: ["Microsoft augments JavaScript for large-scale development"](http://www.infoworld.com/d/application-development/microsoft-augments-javascript-large-scale-development-203737). *[InfoWorld](https://en.wikipedia.org/wiki/InfoWorld "InfoWorld")*. [IDG](https://en.wikipedia.org/wiki/International_Data_Group "International Data Group"). 1 October 2012. [Archived](https://web.archive.org/web/20130531084330/http://www.infoworld.com/d/application-development/microsoft-augments-javascript-large-scale-development-203737) from the original on 31 May 2013. Retrieved 26 April 2015.

[^14]: Turner, Jonathan (2 April 2014). ["Announcing TypeScript 1.0"](https://devblogs.microsoft.com/typescript/announcing-typescript-1-0/). *TypeScript Language team blog*. Microsoft. [Archived](https://web.archive.org/web/20150905104620/http://blogs.msdn.com/b/typescript/archive/2014/04/02/announcing-typescript-1-0.aspx) from the original on 5 September 2015. Retrieved 20 October 2021.

[^15]: [de Icaza, Miguel](https://en.wikipedia.org/wiki/Miguel_de_Icaza "Miguel de Icaza") (1 October 2012). ["TypeScript: First Impressions"](http://tirania.org/blog/archive/2012/Oct-01.html). [Archived](https://web.archive.org/web/20190224173403/https://tirania.org/blog/archive/2012/Oct-01.html) from the original on 24 February 2019. Retrieved 12 October 2012. But TypeScript only delivers half of the value in using a strongly typed language to Unix developers: strong typing. Intellisense, code completion and refactoring are tools that are only available to Visual Studio Professional users on Windows. There is no Eclipse, MonoDevelop or Emacs support for any of the language features.

[^16]: ["Microsoft TypeScript: Can the father of C# save us from the tyranny of JavaScript?"](https://www.zdnet.com/article/microsoft-typescript-can-the-father-of-c-save-us-from-the-tyranny-of-javascript/). [ZDNet](https://en.wikipedia.org/wiki/ZDNet "ZDNet"). 1 October 2012. [Archived](https://web.archive.org/web/20140803030303/http://www.zdnet.com/microsoft-typescript-can-the-father-of-c-save-us-from-the-tyranny-of-javascript-7000005054/) from the original on 3 August 2014. Retrieved 12 October 2012. And I think this is a pretty big misstep. If you're building web apps that run on anything other than Windows, you're likely using a Mac and most likely not using Visual Studio. You need the Visual Studio plug-in to get the IntelliSense. All you get without Visual Studio is the strong-typing. You don't get the productivity benefits you get from IntelliSense.

[^17]: ["TypeStrong: The only TypeScript package you will ever need"](https://github.com/TypeStrong/atom-typescript). *[GitHub](https://en.wikipedia.org/wiki/GitHub "GitHub")*. [Archived](https://web.archive.org/web/20181219102240/https://github.com/TypeStrong/atom-typescript) from the original on 19 December 2018. Retrieved 21 July 2016.

[^18]: Hillar, Gastón (14 May 2013). ["Working with TypeScript in Visual Studio 2012"](http://www.drdobbs.com/windows/working-with-typescript-in-visual-studio/240154792). *[Dr. Dobb's Journal](https://en.wikipedia.org/wiki/Dr._Dobb%27s_Journal "Dr. Dobb's Journal")*. [Archived](https://web.archive.org/web/20180929115630/http://www.drdobbs.com/windows/working-with-typescript-in-visual-studio/240154792) from the original on 29 September 2018. Retrieved 26 April 2015.

[^19]: ["TypeScript 0.9 arrives with new compiler, support for generics"](https://www.theregister.co.uk/2013/06/18/typescript_update_0_9/). *[The Register](https://en.wikipedia.org/wiki/The_Register "The Register")*. 18 June 2013. [Archived](https://web.archive.org/web/20180311081207/https://www.theregister.co.uk/2013/06/18/typescript_update_0_9/) from the original on 11 March 2018. Retrieved 26 April 2015.

[^20]: [Hejlsberg, Anders](https://en.wikipedia.org/wiki/Anders_Hejlsberg "Anders Hejlsberg") (2 April 2014). ["TypeScript"](http://channel9.msdn.com/Events/Build/2014/3-576). *[Channel 9](https://en.wikipedia.org/wiki/Channel_9_\(Microsoft\) "Channel 9 (Microsoft)")*. Microsoft. [Archived](https://web.archive.org/web/20150525013836/http://channel9.msdn.com/Events/Build/2014/3-576) from the original on 25 May 2015. Retrieved 26 April 2015.

[^21]: Jackson, Joab (25 February 2014). ["Microsoft TypeScript graduates to Visual Studio"](http://www.pcworld.com/article/2101920/microsoft-typescript-graduates-to-visual-studio.html). *[PC World](https://en.wikipedia.org/wiki/PC_World "PC World")*. [IDG](https://en.wikipedia.org/wiki/International_Data_Group "International Data Group"). [Archived](https://web.archive.org/web/20160311175558/http://www.pcworld.com/article/2101920/microsoft-typescript-graduates-to-visual-studio.html) from the original on 11 March 2016. Retrieved 26 April 2015.

[^22]: Turner, Jonathan (21 July 2014). ["New Compiler and Moving to GitHub"](https://web.archive.org/web/20140722205833/http://blogs.msdn.com/b/typescript/archive/2014/07/21/new-compiler-and-moving-to-github.aspx). *TypeScript Language team blog*. Microsoft. Archived from [the original](http://blogs.msdn.com/b/typescript/archive/2014/07/21/new-compiler-and-moving-to-github.aspx) on 22 July 2014. Retrieved 26 April 2015.

[^23]: Bright, Peter (22 September 2016). ["TypeScript, Microsoft's JavaScript for big applications, reaches version 2.0"](https://arstechnica.com/information-technology/2016/09/typescript-microsofts-javascript-for-big-applications-reaches-version-2-0/). *[Ars Technica](https://en.wikipedia.org/wiki/Ars_Technica "Ars Technica")*. [Condé Nast](https://en.wikipedia.org/wiki/Cond%C3%A9_Nast "Condé Nast"). [Archived](https://web.archive.org/web/20181221125826/https://arstechnica.com/information-technology/2016/09/typescript-microsofts-javascript-for-big-applications-reaches-version-2-0/) from the original on 21 December 2018. Retrieved 22 September 2016.

[^24]: ["Announcing TypeScript 3.0"](https://devblogs.microsoft.com/typescript/announcing-typescript-3-0/). 30 July 2018. [Archived](https://web.archive.org/web/20200530031718/https://devblogs.microsoft.com/typescript/announcing-typescript-3-0/) from the original on 30 May 2020. Retrieved 16 March 2020.

[^25]: ["TypeScript 3.0"](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html). 30 July 2018. [Archived](https://web.archive.org/web/20200606214433/https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html) from the original on 6 June 2020. Retrieved 16 March 2020.

[^26]: ["Announcing TypeScript 4.0"](https://devblogs.microsoft.com/typescript/announcing-typescript-4-0/). *TypeScript*. 20 August 2020. [Archived](https://web.archive.org/web/20240809080059/https://devblogs.microsoft.com/typescript/announcing-typescript-4-0/) from the original on 9 August 2024. Retrieved 30 October 2020.

[^27]: ["Documentation – TypeScript 5.0"](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html). *www.typescriptlang.org*. [Archived](https://web.archive.org/web/20240809080228/https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html) from the original on 9 August 2024. Retrieved 18 May 2023.

[^28]: [Hejlsberg, Anders](https://en.wikipedia.org/wiki/Anders_Hejlsberg "Anders Hejlsberg") (11 March 2025). ["A 10x Faster TypeScript"](https://devblogs.microsoft.com/typescript/typescript-native-port/). *TypeScript*. Retrieved 11 March 2025.

[^29]: Rosenwasser, Daniel (2 December 2025). ["Progress on TypeScript 7"](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/#typescript-6.0-is-the-last-javascript-based-release). *TypeScript*. Retrieved 21 March 2026.

[^30]: [Hejlsberg, Anders](https://en.wikipedia.org/wiki/Anders_Hejlsberg "Anders Hejlsberg") (5 October 2012). ["What is TypeScript and why with Anders Hejlsberg"](http://www.hanselminutes.com/340/what-is-typescript-and-why-with-anders-hejlsberg). www.hanselminutes.com. [Archived](https://web.archive.org/web/20181227152425/https://www.hanselminutes.com/340/what-is-typescript-and-why-with-anders-hejlsberg) from the original on 27 December 2018. Retrieved 15 January 2014.

[^31]: Somasegar, S. (1 October 2012). ["TypeScript: JavaScript Development at Application Scale"](http://blogs.msdn.com/b/somasegar/archive/2012/10/01/typescript-javascript-development-at-application-scale.aspx). msdn.com. [Archived](https://web.archive.org/web/20150422145537/http://blogs.msdn.com/b/somasegar/archive/2012/10/01/typescript-javascript-development-at-applicatio) from the original on 22 April 2015. Retrieved 27 November 2013.

[^32]: ["Documentation – TypeScript 5.2"](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html). *www.typescriptlang.org*. [Archived](https://web.archive.org/web/20240809080229/https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html) from the original on 9 August 2024. Retrieved 9 November 2023.

[^33]: ["Welcome to TypeScript"](http://www.typescriptlang.org/). *typescriptlang.org*. [Microsoft](https://en.wikipedia.org/wiki/Microsoft "Microsoft"). [Archived](https://web.archive.org/web/20180310153413/https://www.typescriptlang.org/) from the original on 10 March 2018. Retrieved 26 April 2015.

[^34]: Lawson, Darryl K. Taft, Loraine (12 March 2025). ["Go Power: Microsoft's Bold Bet on Faster TypeScript Tools"](https://thenewstack.io/go-power-microsofts-bold-bet-on-faster-typescript-tools/). *The New Stack*. Retrieved 6 January 2026.

[^35]: Bloch, Olivier (1 October 2012). ["Sublime Text, Vi, Emacs: TypeScript enabled!"](http://blogs.msdn.com/b/interoperability/archive/2012/10/01/sublime-text-vi-emacs-typescript-enabled.aspx). [Microsoft](https://en.wikipedia.org/wiki/Microsoft "Microsoft"). [Archived](https://web.archive.org/web/20121029094413/http://blogs.msdn.com/b/interoperability/archive/2012/10/01/sublime-text-vi-emacs-typescript-enabled.aspx) from the original on 29 October 2012. Retrieved 28 October 2012.

[^36]: ["TypeScript support in WebStorm 6"](http://blog.jetbrains.com/webide/2013/02/typescript-support-in-webstorm-6). JetBrains. 27 February 2013. [Archived](https://web.archive.org/web/20160602072057/http://blog.jetbrains.com/webide/2013/02/typescript-support-in-webstorm-6/) from the original on 2 June 2016. Retrieved 20 April 2013.

[^37]: ["TypeScript support in ReSharper 8.1"](http://blog.jetbrains.com/dotnet/2013/10/28/typescript-support-resharper-81/). JetBrains. 28 October 2013. [Archived](https://web.archive.org/web/20140202124541/http://blog.jetbrains.com/dotnet/2013/10/28/typescript-support-resharper-81/) from the original on 2 February 2014. Retrieved 21 January 2014.

[^38]: ["ReSharper: The Visual Studio Extension for.NET Developers by JetBrains"](https://www.jetbrains.com/resharper/). *JetBrains*.

[^39]: ["atom-typescript"](https://atom.io/packages/atom-typescript). *Atom*. [Archived](https://web.archive.org/web/20161004165736/https://atom.io/packages/atom-typescript) from the original on 4 October 2016. Retrieved 9 January 2020.

[^40]: ["TypeStrong/grunt-ts"](https://github.com/basarat/grunt-ts). *GitHub*. [Archived](https://web.archive.org/web/20200416143221/https://github.com/TypeStrong/grunt-ts) from the original on 16 April 2020. Retrieved 26 April 2015.

[^41]: ["ppedregal/typescript-maven-plugin"](https://github.com/ppedregal/typescript-maven-plugin). *GitHub*. [Archived](https://web.archive.org/web/20180611002148/https://github.com/ppedregal/typescript-maven-plugin) from the original on 11 June 2018. Retrieved 26 April 2015.

[^42]: ["ivogabe/gulp-typescript"](https://github.com/ivogabe/gulp-typescript). *GitHub*. [Archived](https://web.archive.org/web/20180611024633/https://github.com/ivogabe/gulp-typescript) from the original on 11 June 2018. Retrieved 14 July 2017.

[^43]: ["sothmann/typescript-gradle-plugin"](https://github.com/sothmann/typescript-gradle-plugin). *GitHub*. [Archived](https://web.archive.org/web/20180611010933/https://github.com/sothmann/typescript-gradle-plugin) from the original on 11 June 2018. Retrieved 26 April 2015.

[^44]: ["TSLint"](https://palantir.github.io/tslint/). *palantir.github.io*. [Archived](https://web.archive.org/web/20221221214353/https://palantir.github.io/tslint/) from the original on 21 December 2022. Retrieved 11 February 2019.

[^45]: Palantir (19 February 2019). ["TSLint in 2019"](https://medium.com/palantir/tslint-in-2019-1a144c2317a9). *Medium*. Retrieved 24 April 2019.

[^46]: ["TSLint Deprecated to Focus Support on typescript-eslint"](https://www.infoq.com/news/2019/02/tslint-deprecated-eslint). *InfoQ*. [Archived](https://web.archive.org/web/20240809080105/https://www.infoq.com/news/2019/02/tslint-deprecated-eslint/) from the original on 9 August 2024. Retrieved 24 April 2019.