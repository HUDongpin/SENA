---
name: ena-official-website-design
description: Use when designing, reviewing, or implementing SENA/ENA web interfaces inspired by the official webENA analysis app at app.epistemicnetwork.org, especially analysis workspaces, ENA model setup flows, plot tools, statistics panels, data-view drawers, and dense research UI patterns.
---

# ENA Official Website Design

Use this skill when the user wants SENA or ENA interface work to borrow from the official webENA product design. The guidance is based on an authenticated observation of the official webENA app on June 11, 2026, distilled into reusable product and UI rules. Do not store or reproduce account credentials, cookies, screenshots, auth state, or private project data when using this skill.

## Core Principle

Design ENA software as a dense researcher workbench, not a marketing page or a generic dashboard. The official app keeps the plot in view, keeps configuration close to the plot, and uses compact controls so researchers can move between set management, model definition, visual tuning, statistics, and raw data without losing context.

## Official webENA Shell

- Use a dark top brand bar with the ENA identity at the far left and a thin teal status strip below it.
- Use a persistent dark icon rail on the far left, about 65px wide on desktop.
- Put primary modes in the rail: Sets, Model, Plot Tools, Stats, and Logout at the bottom.
- Show the active mode with teal `#56b09d`, white icon/text, and inactive modes in muted gray.
- Use a fixed secondary panel beside the rail, about 325px wide on desktop, for the active mode's controls.
- Give the main visualization most of the remaining width: a large central Comparison Plot plus a right column with Primary Plot and Secondary Plot stacked vertically.
- Keep section headings uppercase, small, and utilitarian: `SETS`, `MODEL`, `PLOT TOOLS`, `STATS`, `COMPARISON PLOT`, `PRIMARY PLOT`, `SECONDARY PLOT`.
- Preserve the white/very-light-gray canvas with subtle gray dividers and minimal decoration.

## Visual System

- Primary accent: teal `#56b09d`.
- Disabled teal: pale mint similar to `#bcdfd8`.
- Top/header darks: near-black and charcoal, roughly `#1f1f1f` and `#3b3b3b`.
- Text: compact dark gray body text, muted gray headings, white text on dark drawer headers.
- Typography: Roboto where form controls dominate; Helvetica/Arial-style compact sans for the analysis shell is acceptable when matching existing code.
- Buttons: compact teal filled buttons with small radius, often 2-4px, not large pill buttons.
- Icons: Material Icons or existing ENA icon fonts for rail modes, menu actions, validation, zoom, download, help, flip, and visibility.
- Avoid decorative gradients, hero sections, large cards, big empty marketing copy, and ornamental backgrounds.

## Login Page Pattern

- Use a split layout: left side for login/reset, right side for signup.
- Center the logo and login form in a fixed-width column around 400px.
- Use a large teal welcome/signup heading, compact description, icon-prefixed inputs, and full-width teal action buttons.
- Provide username/password login, password reset, Google login, signup fields, terms checkbox, and cookie notice as practical utility elements.
- Show validation through input state and adjacent icons, not verbose inline explanation.

## Navigation And Workflow

- Treat the left rail as mode switching, not page navigation that hides the workspace.
- In Sets, show a project/folder/set browser with breadcrumbs, compact rows, modified dates, and overflow menus for edit/copy/export/delete actions.
- In Model, use secondary tabs for Units, Conversation, and Codes. Include help tooltips explaining ENA concepts in researcher language.
- In Plot Tools, group controls into sections such as Dimensions, Plotted Points, and Network Graph.
- In Stats, use secondary tabs for Comparison, Goodness of Fit, Variance, and Theory & Methods.
- Keep Advanced Options as a bottom drawer in the secondary panel rather than a separate settings page.
- Keep Data View as a bottom drawer under the central plot rather than replacing the whole workspace.

## Model Setup Cues

- When a valid model does not exist, keep the plot areas visible and show a central checklist-style empty state.
- The checklist should name missing prerequisites, for example: define units, define conversation, select at least three codes.
- Use the empty state as a progress guide, not a blocking modal.
- Make invalid or incomplete states explicit near the visualization surface so researchers understand why plots or statistics are blank.

## Plot And Data Interaction

- The central Comparison Plot is the anchor. It should stay visible while users switch Sets, Model, Plot Tools, and Stats.
- Provide compact plot actions near the plot title: download images, zoom in, zoom out, reset/center.
- The right-side Primary and Secondary plots should act as stable comparison/detail panels.
- Use small plot titles and direct icon actions for hide, remove, and switch plot behavior.
- Show plot legends close to the plotting area, usually near the lower-left of the main plot.
- Use Data View as a collapsible drawer with a dark header and icon+label trigger.
- In data tables, allow column metadata/codes and row-level evidence to remain connected to the plotted model.

## Plot Tools Controls

- Dimensions: dimension labels on/off, editable X/Y axis labels, flip X/Y icons, variance explained on/off.
- Plotted Points: scale units, unit labels, group labels, comparison network.
- Network Graph: code labels, show unconnected codes, connection weights, minimum edge weight, scale for edge weights.
- Advanced plot options: X/Y axis selection, network weighting, line intensity scaling, text size, colors.
- Prefer compact switches, sliders, selects, icon buttons, and short labels over explanatory cards.

## Stats Pattern

- Comparison: two group selectors, info tooltip, Parametric and Non-Parametric run buttons.
- Goodness of Fit: calculate action and compact Pearson/Spearman result table.
- Variance: compact X/Y axis variance table.
- Theory & Methods: generate write-up, copy write-up, and show method text in-place.
- Advanced stats options belong in the bottom drawer, for example significant digits.

## Applying This To SENA

- Start from a full-screen workbench with persistent navigation and plots, not a landing page.
- Preserve SENA's fusion-specific visual grammar while borrowing webENA's workflow density and panel hierarchy.
- Make Temporal Fusion, Fusion Canvas, Data Import, and review/export features feel like research tools sharing one workspace.
- Prefer mode-specific side panels and bottom drawers over route-heavy flows that remove the graph.
- Keep graph surfaces stable when controls change; avoid layout shifts that move the research object away from the user.
- When building new SENA views, show prerequisites, sample-state guidance, and data provenance close to the graph.

## Do

- Keep the main plot visible as the user's anchor.
- Use compact, fixed tool areas: rail, secondary panel, central plot, right plots, bottom drawers.
- Use teal only for active state and primary actions; let gray carry most of the interface.
- Use icons with tooltips for repeated controls.
- Keep labels short and researcher-facing.
- Show model validity and missing setup requirements explicitly.
- Verify dense panels at desktop and narrow widths so text does not overlap.

## Do Not

- Do not turn ENA analysis into a hero page, marketing dashboard, or card-heavy landing surface.
- Do not hide core plot context when the user edits units, codes, statistics, or visual options.
- Do not use large rounded pills, oversized type, decorative gradients, or one-note color washes.
- Do not bury Units, Conversation, Codes, Data View, or Advanced Options in unrelated global settings.
- Do not save credentials, cookies, storage state, screenshots, or private account data in skill files or project artifacts.

## Validation Checklist

Before finishing a webENA-inspired SENA UI change:

- The main analysis graph remains visible or one click away.
- The active rail mode is visually obvious.
- Secondary tabs and drawers are compact and do not cover the plot unexpectedly.
- Empty states explain missing ENA prerequisites.
- Plot controls use familiar icons, switches, selects, sliders, and concise labels.
- The palette reads as restrained gray analytic UI with teal active states.
- Text fits inside controls and panel headers across desktop and mobile checks.
