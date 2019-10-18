from beets import importer, config, plugins
from beets.importer import apply_choice, plugin_stage, manipulate_files, QUEUE_SIZE, ImportAbort, read_tasks, \
	lookup_candidates, SentinelImportTask, SingletonImportTask, action, group_albums
from beets.util import pipeline


@pipeline.mutator_stage
def save_matches(session, task):
	if type(task) == SentinelImportTask:
		return
	session.tasks.append(task)


class WebImporter(importer.ImportSession):
	tasks = list()

	def user_query(self, task):
		if task.choice_flag is action.TRACKS:
			def emitter(task):
				for item in task.items:
					task = SingletonImportTask(task.toppath, item)
					for new_task in task.handle_created(self):
						yield new_task

			stages = [emitter(task), lookup_candidates(self), save_matches(self)]
		if task.choice_flag is action.ALBUMS:
			stages = [[task], group_albums(self), lookup_candidates(self)]

		pl = pipeline.Pipeline(stages)

		if config['threaded']:
			pl.run_parallel(QUEUE_SIZE)
		else:
			pl.run_sequential()

	def import_task(self, task):
		def emitter():
			yield task

		self.set_config(config['import'])
		apply_choice(self, task)
		stages = [emitter()]
		# Plugin stages
		for stage_func in plugins.early_import_stages():
			stages.append(plugin_stage(self, stage_func))
		for stage_func in plugins.import_stages():
			stages.append(plugin_stage(self, stage_func))

		stages.append(manipulate_files(self))

		pl = pipeline.Pipeline(stages)

		plugins.send('import_begin', session=self)
		if config['threaded']:
			pl.run_parallel(QUEUE_SIZE)
		else:
			pl.run_sequential()

	def run(self):
		self.set_config(config['import'])

		pl = pipeline.Pipeline([read_tasks(self), lookup_candidates(self), save_matches(self)])

		plugins.send('import_begin', session=self)
		if config['threaded']:
			pl.run_parallel(QUEUE_SIZE)
		else:
			pl.run_sequential()
