# FlowLink Research Paper

## Overview

This directory contains a comprehensive research paper documenting the FlowLink cross-platform continuity system in IEEE conference paper format.

## Files

- `research_paper.tex` - Main LaTeX source file
- `research_paper.pdf` - Compiled PDF (after compilation)

## Paper Structure

1. **Abstract** - Overview of the system and contributions
2. **Introduction** - Motivation and problem statement
3. **Related Work** - Comparison with existing solutions
4. **System Architecture** - Technical design and components
5. **Core Features** - Detailed feature descriptions
6. **Implementation Details** - Protocol specifications and code
7. **Evaluation** - Performance measurements and analysis
8. **Discussion** - Strengths, limitations, and future work
9. **Conclusion** - Summary and impact

## Key Highlights

### Contributions
- Unified architecture for web, mobile, and browser extension clients
- Real-time synchronization protocols (WebSocket + WebRTC)
- Session-based collaboration with dynamic device discovery
- Production-ready implementation with evaluation results

### Performance Results
- **Clipboard Sync**: 245ms average latency
- **Media Handoff**: 312ms average latency
- **File Transfer**: 45-60 MB/s on local network
- **Scalability**: 500+ concurrent connections per server

### Features Documented
- Universal Clipboard synchronization
- Smart Media Handoff (YouTube, Netflix, etc.)
- WebRTC-based file transfers
- Session management with QR codes
- Username-based invitation system
- Group operations for batch actions

## Compilation Instructions

### Prerequisites

Install a LaTeX distribution:

**Windows:**
```bash
# Install MiKTeX
https://miktex.org/download

# Or install TeX Live
https://www.tug.org/texlive/windows.html
```

**macOS:**
```bash
# Install MacTeX
brew install --cask mactex

# Or BasicTeX (smaller)
brew install --cask basictex
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install texlive-full

# Fedora
sudo dnf install texlive-scheme-full

# Arch
sudo pacman -S texlive-most
```

### Compile the Paper

#### Method 1: Using pdflatex (Recommended)

```bash
# Navigate to project directory
cd /path/to/flowlink

# Compile (run twice for references)
pdflatex research_paper.tex
pdflatex research_paper.tex

# Clean auxiliary files
rm research_paper.aux research_paper.log research_paper.out
```

#### Method 2: Using latexmk (Automated)

```bash
# Install latexmk if not available
# Ubuntu: sudo apt-get install latexmk
# macOS: brew install latexmk

# Compile with automatic reruns
latexmk -pdf research_paper.tex

# Clean all auxiliary files
latexmk -c
```

#### Method 3: Using Overleaf (Online)

1. Go to [Overleaf](https://www.overleaf.com/)
2. Create new project → Upload Project
3. Upload `research_paper.tex`
4. Click "Recompile" to generate PDF
5. Download PDF

### Output

After compilation, you'll get:
- `research_paper.pdf` - The final paper (6-8 pages)
- Various auxiliary files (.aux, .log, .out) - Can be deleted

## Paper Statistics

- **Length**: ~8 pages (IEEE conference format)
- **Sections**: 9 main sections + references
- **Tables**: 1 (latency measurements)
- **Code Listings**: 4 (protocol examples)
- **References**: 10 citations
- **Word Count**: ~4,500 words

## Customization

### Change Author Information

Edit lines 18-23 in `research_paper.tex`:

```latex
\author{\IEEEauthorblockN{Your Name}
\IEEEauthorblockA{\textit{Your Department} \\
\textit{Your University}\\
Your City, Country \\
your.email@university.edu}
}
```

### Add Figures

To add architecture diagram or screenshots:

1. Save image as `architecture.png` in same directory
2. Add to paper:

```latex
\begin{figure}[h]
\centering
\includegraphics[width=0.48\textwidth]{architecture.png}
\caption{FlowLink System Architecture}
\label{fig:architecture}
\end{figure}
```

### Modify Content

The paper is organized in clear sections. To modify:

1. **Abstract**: Lines 25-30
2. **Introduction**: Lines 35-60
3. **Architecture**: Lines 120-180
4. **Features**: Lines 200-300
5. **Evaluation**: Lines 380-450

## Citation

If you use this work, please cite:

```bibtex
@inproceedings{flowlink2024,
  title={FlowLink: A Cross-Platform Continuity System for Seamless Multi-Device Workflows},
  author={Anonymous},
  booktitle={Proceedings of the Conference on Human-Computer Interaction},
  year={2024},
  pages={1--8}
}
```

## Common Issues

### Missing Packages

If you get "File not found" errors:

```bash
# MiKTeX (Windows)
# Packages install automatically on first use

# TeX Live (Linux/Mac)
sudo tlmgr install <package-name>

# Common packages needed:
sudo tlmgr install IEEEtran cite amsmath graphicx hyperref listings booktabs
```

### Bibliography Not Showing

Run pdflatex twice:
```bash
pdflatex research_paper.tex
pdflatex research_paper.tex  # Second run resolves references
```

### Overfull/Underfull Box Warnings

These are usually harmless. To fix:
- Rephrase sentences to fit better
- Add `\sloppy` before problematic paragraphs
- Adjust hyphenation with `\hyphenation{word-list}`

## Viewing the PDF

**Windows:**
- Adobe Acrobat Reader
- SumatraPDF (lightweight)
- Browser (Chrome, Edge)

**macOS:**
- Preview (built-in)
- Adobe Acrobat Reader
- Skim (PDF viewer for LaTeX)

**Linux:**
- Evince (GNOME)
- Okular (KDE)
- Firefox/Chrome

## Converting to Other Formats

### To Word (.docx)

```bash
# Install pandoc
# Ubuntu: sudo apt-get install pandoc
# macOS: brew install pandoc
# Windows: https://pandoc.org/installing.html

# Convert
pandoc research_paper.tex -o research_paper.docx
```

### To HTML

```bash
# Using pandoc
pandoc research_paper.tex -o research_paper.html --standalone

# Or using htlatex
htlatex research_paper.tex
```

## Paper Submission

This paper uses IEEE conference format, suitable for:
- IEEE conferences (CHI, UIST, MobileHCI, etc.)
- ACM conferences (with minor formatting changes)
- Technical reports
- Thesis chapters

For specific conference submission:
1. Check conference LaTeX template
2. Adjust document class if needed
3. Follow conference-specific guidelines
4. Update references to match citation style

## License

This research paper documents the FlowLink project. The LaTeX source is provided as-is for academic and documentation purposes.

## Contact

For questions about the paper or project:
- Open an issue on GitHub
- Email: [your-email]
- Project: https://github.com/[your-repo]/flowlink

## Acknowledgments

Paper template based on IEEE conference proceedings format.
