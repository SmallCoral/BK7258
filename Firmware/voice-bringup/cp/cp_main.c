#include <bk_private/bk_init.h>
#include <driver/pwr_clk.h>
#include <modules/pm.h>
#include <os/os.h>

extern void rtos_set_user_app_entry(beken_thread_function_t entry);

static void start_ap(beken_thread_arg_t arg)
{
	(void)arg;
	bk_pm_module_vote_boot_cp1_ctrl(PM_BOOT_CP1_MODULE_NAME_APP,
				       PM_POWER_MODULE_STATE_ON);
}

int main(void)
{
	rtos_set_user_app_entry(start_ap);
	bk_init();
	return 0;
}
