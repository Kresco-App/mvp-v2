from django.db import models


class Subject(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    thumbnail_url = models.URLField(blank=True, max_length=500)
    is_published = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'subjects'
        ordering = ['order', 'title']

    def __str__(self):
        return self.title


class Chapter(models.Model):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='chapters')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chapters'
        ordering = ['order']

    def __str__(self):
        return f"{self.subject.title} › {self.title}"


class Lesson(models.Model):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='lessons')
    title = models.CharField(max_length=255)
    vdocipher_id = models.CharField(max_length=255, blank=True)
    duration_seconds = models.IntegerField(default=0)
    is_free_preview = models.BooleanField(default=False)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lessons'
        ordering = ['order']

    def __str__(self):
        return self.title

    @property
    def duration_display(self):
        m, s = divmod(self.duration_seconds, 60)
        return f"{m}:{s:02d}"


class ChapterBlock(models.Model):
    BLOCK_TYPE_CHOICES = [('text', 'Text'), ('markdown', 'Markdown')]

    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='blocks')
    title = models.CharField(max_length=255, blank=True)
    content = models.TextField()
    block_type = models.CharField(max_length=20, choices=BLOCK_TYPE_CHOICES, default='markdown')
    order = models.IntegerField(default=0)

    class Meta:
        db_table = 'chapter_blocks'
        ordering = ['order']

    def __str__(self):
        return f"Block: {self.title or self.block_type}"


class Activity(models.Model):
    """Interactive activity component attached to a lesson (drag-drop, matching, fill-blank, etc.)"""
    ACTIVITY_TYPES = [
        ('drag_and_drop', 'Glisser-deposer'),
        ('matching', 'Appariement'),
        ('fill_in_blank', 'Texte a trous'),
        ('true_false', 'Vrai ou Faux'),
        ('ordering', 'Mise en ordre'),
        ('custom_react', 'Composant React personnalise'),
        ('simulator', 'Simulateur interactif'),
    ]

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='activities')
    title = models.CharField(max_length=255)
    activity_type = models.CharField(max_length=30, choices=ACTIVITY_TYPES)
    config_json = models.JSONField(
        help_text="Configuration JSON de l'activite. Structure depend du type.",
        default=dict, blank=True,
    )
    react_component_url = models.URLField(
        blank=True,
        help_text="URL du composant React (pour le type custom_react uniquement)"
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'activities'
        ordering = ['order']
        verbose_name = 'Activite interactive'
        verbose_name_plural = 'Activites interactives'

    def __str__(self):
        return f"{self.get_activity_type_display()}: {self.title}"


class ChapterSection(models.Model):
    SECTION_TYPES = [
        ('video', 'Video'),
        ('quiz', 'Quiz'),
        ('activity', 'Activite interactive'),
        ('text', 'Texte / Lecture'),
    ]
    ACTIVITY_TYPES = [
        ('drag_and_drop', 'Glisser-deposer'),
        ('matching', 'Associations'),
        ('fill_in_blank', 'Texte a trous'),
        ('true_false', 'Vrai ou Faux'),
        ('ordering', 'Mise en ordre'),
        ('multiple_choice', 'Choix multiple'),
        ('labeling', 'Etiquetage'),
        ('flashcards', 'Cartes memoire'),
        ('classification', 'Classification'),
        ('simulator', 'Simulateur'),
        ('onde_propagation', 'Onde - Propagation'),
        ('onde_caracteristiques', 'Onde - Caracteristiques'),
        ('onde_true_false', 'Onde - Vrai/Faux'),
        ('math_ensembles_lab', 'Math - Ensembles'),
        ('math_limites_continuite_lab', 'Math - Limites et continuite'),
        ('wave_simulator', 'Simulateur - Onde'),
        ('prism_simulator', 'Simulateur - Prisme'),
        ('diffraction_simulator', 'Simulateur - Diffraction'),
    ]
    chapter = models.ForeignKey(Chapter, related_name='sections', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    section_type = models.CharField(max_length=20, choices=SECTION_TYPES)
    order = models.IntegerField(default=0)
    is_gating = models.BooleanField(default=True, help_text='Must complete to unlock next section')

    # Video fields
    vdocipher_id = models.CharField(max_length=255, blank=True)
    duration_seconds = models.IntegerField(default=0)
    is_free_preview = models.BooleanField(default=False)

    # Text/Reading fields
    content = models.TextField(blank=True)

    # Quiz fields (JSON format: {"questions": [{"text": "...", "options": [{"text": "...", "is_correct": true}]}], "pass_score": 70})
    quiz_data = models.JSONField(null=True, blank=True)
    pass_score = models.IntegerField(default=70)

    # Activity fields
    activity_type = models.CharField(max_length=30, blank=True, choices=ACTIVITY_TYPES)
    activity_data = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = 'chapter_sections'
        ordering = ['chapter', 'order']

    def __str__(self):
        return f"{self.chapter.title} - {self.order}. {self.title}"


class CoursePDF(models.Model):
    """PDF support document for a lesson"""
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='pdfs')
    title = models.CharField(max_length=255)
    file_url = models.URLField(max_length=500, help_text="URL du fichier PDF (S3 ou autre)")
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'course_pdfs'
        ordering = ['order']
        verbose_name = 'Support de cours (PDF)'
        verbose_name_plural = 'Supports de cours (PDF)'

    def __str__(self):
        return f"PDF: {self.title}"
