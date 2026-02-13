# ControlledChaos — Theoretical Framework

**ADHD-Friendly Productivity Application**
*Cognitive Science Foundations for Design*

Lanae Drew
University of Delaware — Associate in Arts Program
February 2026 | Version 1.0

---

## 1. Introduction

ControlledChaos is a productivity application designed specifically for people with Attention-Deficit/Hyperactivity Disorder (ADHD). Rather than forcing users into rigid organizational systems that conflict with how ADHD brains actually work, ControlledChaos provides flexible external scaffolding that compensates for executive function differences while leveraging the genuine cognitive strengths associated with ADHD.

This document establishes the cognitive science foundations that inform ControlledChaos's design philosophy, feature set, and user experience decisions. Each theoretical framework is presented alongside its specific implications for the application, creating a direct line from peer-reviewed science to product design.

The theories selected here span executive function, attention regulation, cognitive load, motivation, and flow states. Together, they support a core thesis: **ADHD is best understood not as a deficit to be corrected, but as a difference in cognitive architecture that requires different tools.**

---

## 2. Core Theoretical Foundations

### 2.1 Barkley's Model of Executive Function and Self-Regulation

Russell Barkley's model of ADHD is the dominant theoretical framework in the field. He proposed that ADHD stems from a primary deficit in behavioral inhibition, which produces secondary impairments across four executive functions: nonverbal working memory, the internalization of speech (verbal working memory), the self-regulation of affect/motivation/arousal, and reconstitution (the ability to break apart and recombine behavioral sequences).

> Coghill, D. (2014). *Journal of Child Psychology and Psychiatry, 55*(7), 737–740. https://doi.org/10.1111/jcpp.12284

A critical insight from this model is the concept of a "cascade of secondary deficits": a deficiency in one executive function area impacts the others progressively. Executive functioning develops from self-direction, to near-term goal achievement, to social coordination, to shared long-term goals. Because individuals with ADHD demonstrate deficits in internal self-control, their behavior relies more heavily on the external environment.

> McKenna, K. et al. (2023). *Psychology in the Schools, 60*(12), 5167–5188. https://doi.org/10.1002/pits.23026

#### Design Implications

Barkley's model provides the foundational justification for ControlledChaos's entire design philosophy. Because ADHD involves impaired *internal* self-regulation, the application serves as an **external regulatory structure** — providing cues, prompts, time awareness, and immediate feedback that the ADHD brain cannot reliably generate on its own. This is not a crutch; it is a prosthetic for a real neurological difference.

| EF Deficit | App Response |
|---|---|
| Working memory | Persistent task visibility; information doesn't disappear behind navigation |
| Self-regulation of motivation | External reward cues, progress indicators, streak mechanics |
| Internalization of speech | Externalized self-talk via prompts, check-ins, and reminders |
| Reconstitution | Flexible task decomposition; ability to break and recombine tasks |

### 2.2 ADHD as Attention Dysregulation

Contemporary research has moved away from framing ADHD as a simple "deficit" of attention. Instead, evidence increasingly supports the view that ADHD involves a failure of **attention regulation** — the inability to flexibly allocate, sustain, and disengage attention according to task demands. This includes the well-documented phenomenon of hyperfocus: an inability to detach attention from compelling stimuli.

> Pacheco, J. et al. (2022). *Journal of Child Psychology and Psychiatry, 63*(4), 360–376. https://doi.org/10.1111/jcpp.13543

Neuroimaging research supports this reframing, showing intrusions of resting-state and default-mode networks during tasks that should engage attention-focused networks. The attentional system isn't broken — it's differently wired, with different switching costs and different engagement patterns.

#### Design Implications

This reframing is central to ControlledChaos's identity. The application is not designed to "fix" attention but to **channel dysregulated attention productively**. Features should help users ride their attention patterns — surfacing the right task at the right moment, providing gentle redirection rather than rigid enforcement, and acknowledging that attention will shift rather than trying to prevent it.

### 2.3 Cognitive Load Theory

Cognitive Load Theory (CLT), developed by John Sweller, describes the relationship between working memory capacity and the demands of a task. Working memory can process only 3–5 information elements simultaneously, for no longer than approximately 18 seconds. CLT distinguishes three types of load: intrinsic (inherent task complexity), extraneous (how the task is presented), and germane (resources devoted to productive schema-building).

> Zhang, S., Koning, B. B., & Paas, F. (2022). *British Journal of Educational Psychology, 93*(S2), 287–304. https://doi.org/10.1111/bjep.12556

CLT is especially relevant for ADHD populations because working memory impairments are among the most consistently documented cognitive features of the condition. Multiple meta-analyses confirm strong associations between working memory deficits and ADHD, and some evidence suggests working memory capacity may be a stronger predictor of task performance than IQ in individuals with executive function challenges.

> Le Cunff, A., Dommett, E., & Giampietro, V. (2023). *European Journal of Neuroscience, 59*(2), 256–282. https://doi.org/10.1111/ejn.16201

#### Design Implications

Every interface decision in ControlledChaos should be evaluated through the CLT lens. The goal is to **minimize extraneous cognitive load** (unnecessary UI complexity, excessive choices, confusing navigation) and **maximize germane load** (the productive work the user actually came to do). This provides the scientific basis for the application's "reduce decisions, don't create more" design philosophy.

| Load Type | Design Strategy |
|---|---|
| **Intrinsic** | Scaffold complex tasks with decomposition; match difficulty to user state |
| **Extraneous** | Minimize: reduce options per screen, eliminate unnecessary navigation, use progressive disclosure |
| **Germane** | Maximize: direct user energy toward the actual task, not toward figuring out the tool |

---

## 3. Hyperfocus, Flow, and Attentional Patterns

### 3.1 Flow State Theory

Mihaly Csikszentmihalyi's flow state theory describes a state of full task absorption characterized by intense concentration, distraction-less focus, distorted sense of time, and intrinsic satisfaction. Flow is most likely when there is a match between the individual's skills and the challenge of the task.

Neuroscientific research has identified the brain systems underlying flow: dopaminergic and noradrenergic systems mediate the intrinsic motivation and activated mood states, while three large-scale attentional networks — the Default Mode Network, Central Executive Network, and Salience Network — regulate the strong task engagement and diminished self-referential thinking characteristic of flow.

> Linden, D., Tops, M., & Bakker, A. B. (2020). *European Journal of Neuroscience, 53*(4), 947–963. https://doi.org/10.1111/ejn.15014

### 3.2 Hyperfocus as ADHD-Specific Attentional Pattern

Hyperfocus is related to but distinct from flow. While flow involves a skill-challenge balance, hyperfocus in ADHD involves intense absorption driven partly by dopamine deficiency — a coping mechanism where the individual becomes so deeply engaged that external awareness narrows dramatically. Emerging philosophical and cognitive science work argues that hyperfocus should be understood as a legitimate form of cognitive agency, not merely a symptom.

> Field, C., & Sylvan, K. (2025). *Philosophy and Phenomenological Research, 111*(2), 513–531. https://doi.org/10.1111/phpr.70034

The neurodiversity framework positions hyperfocus as both a strength (enabling deep work, creative insight, and sustained engagement with topics of interest) and a risk (losing awareness of time, neglecting other responsibilities, difficulty disengaging). This dual nature is central to ControlledChaos's design challenge.

#### Design Implications

ControlledChaos should be designed to **facilitate productive hyperfocus while providing exit ramps**. This means removing friction from entering focus states (quick task access, minimal setup), maintaining engagement during focus (no intrusive interruptions), and providing gentle, non-jarring transition cues when it's time to shift (soft timers, awareness prompts, "save point" mechanics). The application should never abruptly break a focus state — it should help users surface gracefully.

---

## 4. Motivation and Behavioral Design

### 4.1 The Resources-Based Model of High-Functioning ADHD

Recent research has proposed a resources-based model that reframes ADHD through the lens of potential strengths. High-functioning ADHD is described as involving high motivation incited by minimal external stimuli, extraordinary creativity, out-of-the-box thinking, spontaneity, novelty-seeking, and the ability to hyperfocus — alongside positive emotionality, enthusiasm, and passion.

> Lesch, K. (2018). *Journal of Child Psychology and Psychiatry, 59*(3), 191–192. https://doi.org/10.1111/jcpp.12887

This model challenges the deficit-only view and emphasizes the importance of enabling individuals to transition from "being controlled by their persisting deficits" to "being able to take advantage of their skills and resources."

#### Design Implications

This model informs ControlledChaos's entire brand and framing. The application is not a "coping tool for a disorder" — it is a **performance optimization system** for a brain that works differently. Language, onboarding, and feature framing should consistently emphasize leveraging strengths rather than compensating for weaknesses.

### 4.2 Self-Determination Theory

Self-Determination Theory (SDT), developed by Edward Deci and Richard Ryan, posits that intrinsic motivation depends on three basic psychological needs: **autonomy** (experiencing choice and volition), **competence** (feeling effective and capable), and **relatedness** (feeling connected to others or to meaningful goals). SDT separates motivation into a continuum from amotivation (disorganized, apathetic) through extrinsic motivation (reward-driven) to intrinsic motivation (autonomous engagement for its own sake).

> Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. *American Psychologist, 55*(1), 68–78. https://doi.org/10.1037/0003-066X.55.1.68

Recent longitudinal research has applied SDT directly to ADHD populations. Smith et al. (2023) found that adolescents with ADHD had worse academic motivation at all timepoints compared to peers, but critically, **intrinsic motivation was a stronger predictor of academic success for youth with ADHD than for those without**. For youth with ADHD, amotivation, extrinsic motivation, and intrinsic motivation all independently predicted GPA — whereas for neurotypical youth, only amotivation and extrinsic motivation mattered. This suggests that fostering genuine intrinsic motivation is disproportionately important for ADHD populations.

> Smith, Z. R., Flax, M., Becker, S. P., & Langberg, J. (2023). *Journal of Child Psychology and Psychiatry, 64*(9), 1303–1313. https://doi.org/10.1111/jcpp.13815

The authors note that SDT has significant potential to further the field's understanding of why ADHD behaviors occur, and raise the concern that many current ADHD interventions primarily foster extrinsic motivation (reward charts, token economies) rather than building the autonomy and intrinsic engagement that produce more durable outcomes.

#### Design Implications

| SDT Need | ControlledChaos Implementation |
|---|---|
| **Autonomy** | Offer choices within structure; let users select how to engage, not whether to engage; avoid mandatory workflows |
| **Competence** | Show clear, immediate progress; celebrate completed tasks; make effort visible through metrics and streaks |
| **Relatedness** | Connect tasks to meaningful goals; help users see why their work matters; link daily actions to larger purpose |

### 4.3 Delay Aversion Theory

Delay aversion theory, developed by Edmund Sonuga-Barke as part of the **dual-pathway model** of ADHD, proposes that ADHD involves two dissociable neuropsychological pathways: one involving executive function deficits (working memory, inhibition), and a second involving motivational dysfunction — specifically, a heightened aversion to delay. The delay aversion pathway suggests that ADHD symptoms are partly a functional expression of a motivational style: children with ADHD prefer smaller immediate rewards over larger delayed ones not simply due to impulsivity, but because they experience the waiting itself as subjectively aversive.

> Sonuga-Barke, E. J. S. (2002). Psychological heterogeneity in AD/HD: A dual pathway model of behaviour and cognition. *Behavioural Brain Research, 130*(1–2), 29–36. https://doi.org/10.1016/S0166-4328(01)00432-6

Neuroimaging research has confirmed the biological basis of delay aversion. Van Dessel et al. (2018) found that adolescents with ADHD showed significantly greater activation in the amygdala, anterior insula, and prefrontal cortex when presented with cues predicting impending delay — regions known to process aversive events. Crucially, this amygdala and prefrontal activation was delay-dose dependent (stronger responses to longer delays) and statistically mediated the relationship between ADHD status and self-reported delay aversion.

> Van Dessel, J., Sonuga-Barke, E., Mies, G., et al. (2018). *Journal of Child Psychology and Psychiatry, 59*(8), 888–899. https://doi.org/10.1111/jcpp.12868

Multiple meta-analyses confirm that individuals with ADHD show steeper temporal discounting — the subjective value of a reward drops off more sharply as it is moved into the future. This interacts with Barkley's model: impaired self-regulation of motivation makes the aversive experience of delay harder to override through willpower alone.

> Sjöwall, D., Roth, L., Lindqvist, S., & Thorell, L. B. (2012). *Journal of Child Psychology and Psychiatry, 54*(6), 619–627. https://doi.org/10.1111/jcpp.12006

#### Design Implications

Immediate feedback loops are not a "nice to have" — they are compensating for a real neurological difference. ControlledChaos should provide instant visual or haptic feedback for every action, keep progress bars and completion indicators constantly visible, break large tasks into short bursts with frequent micro-completions, and never require users to wait through loading states or multi-step processes without visible progress.

---

## 5. Integrated Design Framework

The theories above converge on a unified set of design principles for ControlledChaos. The following table maps each principle to its theoretical justification, creating an auditable link between science and product decisions.

| Design Principle | Theoretical Basis | Feature Examples |
|---|---|---|
| External scaffolding over internal discipline | Barkley's EF Model | Persistent task views, timers, check-in prompts |
| Channel attention, don't fight it | Attention Dysregulation; Hyperfocus research | Context-aware task surfacing, flexible focus modes |
| Minimize decisions per interaction | Cognitive Load Theory | Progressive disclosure, smart defaults, minimal UI |
| Enable productive hyperfocus with exit ramps | Flow Theory; Hyperfocus | Focus timers, gentle transition cues, save points |
| Frame strengths, not deficits | Resources-Based ADHD Model | Strengths-oriented language, achievement framing |
| Support autonomy, competence, and relatedness | Self-Determination Theory | Choice within structure, visible progress, goal linking |
| Provide immediate, constant feedback | Delay Aversion Theory | Instant feedback, micro-completions, visual progress |

---

## 6. References

Coghill, D. (2014). Editorial: Acknowledging complexity and heterogeneity in causality. *Journal of Child Psychology and Psychiatry, 55*(7), 737–740. https://doi.org/10.1111/jcpp.12284

Field, C., & Sylvan, K. (2025). Neurodiversity and attentional normativity. *Philosophy and Phenomenological Research, 111*(2), 513–531. https://doi.org/10.1111/phpr.70034

Kozhevnikov, M., Strasser, A., & Abdullah, M. A. (2022). Accessing the states of enhanced cognition in a gaming context. *Cognitive Science, 46*(2). https://doi.org/10.1111/cogs.13106

Le Cunff, A., Dommett, E., & Giampietro, V. (2023). Neurophysiological measures and correlates of cognitive load in ADHD, ASD and dyslexia. *European Journal of Neuroscience, 59*(2), 256–282. https://doi.org/10.1111/ejn.16201

Lesch, K. (2018). 'Shine bright like a diamond!': Is research on high-functioning ADHD at last entering the mainstream? *Journal of Child Psychology and Psychiatry, 59*(3), 191–192. https://doi.org/10.1111/jcpp.12887

Linden, D., Tops, M., & Bakker, A. B. (2020). Go with the flow: A neuroscientific view on being fully engaged. *European Journal of Neuroscience, 53*(4), 947–963. https://doi.org/10.1111/ejn.15014

McKenna, K., Bray, M. A., Fitzmaurice, B., Choi, D., DeMaio, E., Bray, C. R., & Bernstein, C. (2023). Self-monitoring with goal-setting: Decreasing disruptive behavior in children with ADHD. *Psychology in the Schools, 60*(12), 5167–5188. https://doi.org/10.1002/pits.23026

Pacheco, J., Garvey, M. A., Sarampote, C. S., Cohen, E. D., Murphy, E. R., & Friedman-Hill, S. R. (2022). Annual Research Review: The contributions of the RDoC research framework. *Journal of Child Psychology and Psychiatry, 63*(4), 360–376. https://doi.org/10.1111/jcpp.13543

Reddy, L. A., Cleary, T. J., Alperin, A., & Verdesco, A. (2018). A critical review of self-regulated learning interventions for children with ADHD. *Psychology in the Schools, 55*(6), 609–628. https://doi.org/10.1002/pits.22142

Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. *American Psychologist, 55*(1), 68–78. https://doi.org/10.1037/0003-066X.55.1.68

Sjöwall, D., Roth, L., Lindqvist, S., & Thorell, L. B. (2012). Multiple deficits in ADHD: Executive dysfunction, delay aversion, reaction time variability, and emotional deficits. *Journal of Child Psychology and Psychiatry, 54*(6), 619–627. https://doi.org/10.1111/jcpp.12006

Smith, Z. R., Flax, M., Becker, S. P., & Langberg, J. (2023). Academic motivation decreases across adolescence for youth with and without ADHD: Effects of motivation on academic success. *Journal of Child Psychology and Psychiatry, 64*(9), 1303–1313. https://doi.org/10.1111/jcpp.13815

Sonuga-Barke, E. J. S. (2002). Psychological heterogeneity in AD/HD: A dual pathway model of behaviour and cognition. *Behavioural Brain Research, 130*(1–2), 29–36. https://doi.org/10.1016/S0166-4328(01)00432-6

Van Dessel, J., Sonuga-Barke, E., Mies, G., Lemiere, J., Van der Oord, S., Morsink, S., & Danckaerts, M. (2018). Delay aversion in ADHD is mediated by amygdala and prefrontal cortex hyper-activation. *Journal of Child Psychology and Psychiatry, 59*(8), 888–899. https://doi.org/10.1111/jcpp.12868

Zhang, S., Koning, B. B., & Paas, F. (2022). Effects of finger and mouse pointing on learning from online split-attention examples. *British Journal of Educational Psychology, 93*(S2), 287–304. https://doi.org/10.1111/bjep.12556
