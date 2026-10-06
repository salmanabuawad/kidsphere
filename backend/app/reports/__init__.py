"""PDF reports (WP2-PDF; COVERAGE-MATRIX §6).

    service.py        export_pdf / list_exports (access, builder, render, export log, audit)
    context.py        ReportContext: the child, the options, the language, lazy read-only queries
    builders/         one module per report type + shared pieces (questionnaire, observation, plan, timeline)
    values.py         registry storage paths and stored answers → printable answers; source labels
    model.py          the report model (sections and blocks) the templates render
    i18n.py           messages/{en,ar,he}.json, dates, months, ages (Western digits)
    render.py         Jinja2 (autoescape) → WeasyPrint → bytes; local-only fetcher; one render at a time
    templates/        base, header, footer, section and block templates
    static/           report.css, page-ltr.css, page-rtl.css, the logo mark
    fonts/            bundled OFL fonts (Rubik, Noto Sans Hebrew, Noto Sans Arabic) + licences

Nothing in this package imports the AI package.
"""
